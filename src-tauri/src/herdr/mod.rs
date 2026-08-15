mod discovery;
mod transport;

use std::{sync::Arc, time::Duration};

use tauri::{AppHandle, Emitter};
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    time::sleep,
};
use tracing::{info, warn};

use crate::{
    agents::AgentInfo,
    pet::PetIntent,
    protocol,
    runtime::{ConnectionState, RuntimeState},
};

use crate::protocol::{
    EventMessage, PingResponse, SnapshotResponse, SnapshotResult, SubscribeResponse,
};

pub async fn run(app: AppHandle, state: Arc<RuntimeState>) {
    let delays = [250_u64, 500, 1_000, 2_000, 5_000, 10_000];
    let mut attempt = 0_usize;
    loop {
        let config = state.config.read().await.clone();
        let endpoint = discovery::discover(&config.herdr);
        {
            let mut status = state.connection.write().await;
            status.state = ConnectionState::Connecting;
            status.socket_path = Some(endpoint.display().to_string());
            status.last_error = None;
            status.retry_in_ms = None;
        }
        state.emit_runtime(&app).await;

        match connect_and_subscribe(&app, &state, &endpoint).await {
            Ok(()) => {
                attempt = 0;
                info!("refreshing Herdr snapshot and subscriptions");
                continue;
            }
            Err(error) => {
                let delay = delays[attempt.min(delays.len() - 1)];
                attempt = (attempt + 1).min(delays.len() - 1);
                warn!(%error, delay, "Herdr connection failed");
                state.set_disconnected(&app, error, delay).await;
                tokio::select! {
                    _ = sleep(Duration::from_millis(delay)) => {},
                    _ = state.reconnect.notified() => { attempt = 0; }
                }
                continue;
            }
        }
    }
}

fn emit_pet_intent(app: &AppHandle, intent: PetIntent) {
    let app = app.clone();
    let _ = app.clone().run_on_main_thread(move || {
        let _ = app.emit("pet://intent", intent);
    });
}

async fn connect_and_subscribe(
    app: &AppHandle,
    state: &Arc<RuntimeState>,
    endpoint: &transport::Endpoint,
) -> Result<(), String> {
    let pong = request_ping(endpoint).await?;
    if pong.kind != "pong" {
        return Err(format!("unexpected Herdr ping response: {}", pong.kind));
    }
    let snapshot = request_snapshot(endpoint).await?;
    if pong.protocol != snapshot.snapshot.protocol {
        return Err(format!(
            "Herdr protocol changed during connection ({} -> {})",
            pong.protocol, snapshot.snapshot.protocol
        ));
    }
    if pong.version != snapshot.snapshot.version {
        return Err(format!(
            "Herdr version changed during connection ({} -> {})",
            pong.version, snapshot.snapshot.version
        ));
    }
    let observation = state.config.read().await.herdr.observation.clone();
    let agents = snapshot
        .snapshot
        .agents
        .into_iter()
        .map(|agent| agent.into_agent_info(endpoint.session_id()))
        .filter(|agent| observation.includes(&agent.workspace_id, &agent.pane_id))
        .collect::<Vec<_>>();
    let pane_ids = snapshot
        .snapshot
        .panes
        .into_iter()
        .map(|pane| pane.id)
        .collect::<Vec<_>>();
    {
        state.agents.write().await.replace(agents);
        let mut status = state.connection.write().await;
        status.state = ConnectionState::Connected;
        status.version = Some(pong.version);
        status.protocol = Some(pong.protocol);
        status.last_error = None;
        status.retry_in_ms = None;
    }
    info!(panes = pane_ids.len(), "connected to Herdr");
    let config = state.config.read().await.clone();
    if !config.herdr.observation.quiet()
        && let Some(reconnect_intent) = state.intents.write().await.reconnected(&config)
    {
        emit_pet_intent(app, reconnect_intent);
    }
    state.emit_runtime(app).await;

    let mut stream = transport::connect(endpoint)
        .await
        .map_err(|error| error.to_string())?;
    let request = protocol::subscribe_request(&pane_ids);
    stream
        .write_all(request.as_bytes())
        .await
        .map_err(|error| error.to_string())?;
    stream
        .write_all(b"\n")
        .await
        .map_err(|error| error.to_string())?;
    stream.flush().await.map_err(|error| error.to_string())?;
    let mut lines = BufReader::new(stream).lines();
    let acknowledgement = lines
        .next_line()
        .await
        .map_err(|error| error.to_string())?
        .ok_or("Herdr closed before subscription acknowledgement")?;
    let acknowledgement: SubscribeResponse = serde_json::from_str(&acknowledgement)
        .map_err(|error| format!("invalid Herdr subscription response: {error}"))?;
    acknowledgement.ensure_ok()?;

    loop {
        let line = tokio::select! {
            line = lines.next_line() => line.map_err(|error| error.to_string())?,
            _ = state.reconnect.notified() => return Ok(()),
        };
        let Some(line) = line else {
            return Err("Herdr subscription closed".into());
        };
        let Ok(event) = serde_json::from_str::<EventMessage>(&line) else {
            continue;
        };
        let event_kind = match &event {
            EventMessage::AgentStatus(_) => "pane.agent_status_changed",
            EventMessage::PaneExited(_) => "pane.exited",
            EventMessage::PaneClosed(_) => "pane.closed",
            EventMessage::PaneCreated(_) => "pane.created",
            EventMessage::AgentDetected(_) => "agent.detected",
            EventMessage::Other => "other",
        };
        state.record_event(event_kind).await;
        match event {
            EventMessage::AgentStatus(data) => {
                info!(
                    pane_id = %data.pane_id,
                    workspace_id = %data.workspace_id,
                    status = ?data.agent_status,
                    "received pane.agent_status_changed"
                );
                let agent = AgentInfo {
                    session_id: endpoint.session_id().to_string(),
                    workspace_id: data.workspace_id,
                    pane_id: data.pane_id,
                    agent: data.display_agent.or(data.agent),
                    title: data.title,
                    state: data.agent_status,
                };
                let observation = state.config.read().await.herdr.observation.clone();
                if !observation.includes(&agent.workspace_id, &agent.pane_id) {
                    state
                        .agents
                        .write()
                        .await
                        .remove(&agent.session_id, &agent.pane_id);
                    state.queue_runtime_emit();
                    continue;
                }
                let transition = state.agents.write().await.update(agent.clone());
                if let Some(transition) = transition {
                    let config = state.config.read().await.clone();
                    if observation.quiet()
                        && !matches!(
                            transition,
                            crate::agents::TransitionKind::TurnCompleted
                                | crate::agents::TransitionKind::TurnCompletedBackground
                                | crate::agents::TransitionKind::AttentionRequested
                        )
                    {
                        state.queue_runtime_emit();
                        continue;
                    }
                    if let Some(intent) = state
                        .intents
                        .write()
                        .await
                        .create_from_transition(transition, &agent, &config)
                    {
                        emit_pet_intent(app, intent);
                    }
                }
                state.queue_runtime_emit();
            }
            EventMessage::PaneExited(data) | EventMessage::PaneClosed(data) => {
                let removed = state
                    .agents
                    .write()
                    .await
                    .remove(endpoint.session_id(), &data.pane_id);
                if let Some(agent) = removed {
                    let config = state.config.read().await.clone();
                    if !config.herdr.observation.quiet()
                        && let Some(intent) =
                            state.intents.write().await.agent_exited(&agent, &config)
                    {
                        emit_pet_intent(app, intent);
                    }
                }
                state.emit_runtime(app).await;
                return Ok(());
            }
            EventMessage::PaneCreated(data) | EventMessage::AgentDetected(data) => {
                info!(pane_id = %data.pane_id, "Herdr topology changed");
                let config = state.config.read().await.clone();
                if !config.herdr.observation.quiet()
                    && let Some(intent) = state
                        .intents
                        .write()
                        .await
                        .agent_detected(&data.pane_id, &config)
                {
                    emit_pet_intent(app, intent);
                }
                return Ok(());
            }
            EventMessage::Other => {}
        }
    }
}

async fn request_ping(endpoint: &transport::Endpoint) -> Result<protocol::PingResult, String> {
    let mut stream = transport::connect(endpoint)
        .await
        .map_err(|error| error.to_string())?;
    let line = protocol::exchange_line(
        &mut stream,
        "{\"id\":\"ping_1\",\"method\":\"ping\",\"params\":{}}",
    )
    .await?;
    let response: PingResponse = serde_json::from_str(&line)
        .map_err(|error| format!("invalid Herdr ping response: {error}"))?;
    response.into_result()
}

async fn request_snapshot(endpoint: &transport::Endpoint) -> Result<SnapshotResult, String> {
    let mut stream = transport::connect(endpoint)
        .await
        .map_err(|error| error.to_string())?;
    let line = protocol::exchange_line(
        &mut stream,
        "{\"id\":\"snapshot_1\",\"method\":\"session.snapshot\",\"params\":{}}",
    )
    .await?;
    let response: SnapshotResponse = serde_json::from_str(&line)
        .map_err(|error| format!("invalid Herdr snapshot response: {error}"))?;
    response.into_result()
}
