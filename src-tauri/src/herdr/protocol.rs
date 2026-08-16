use serde::Deserialize;
use tokio::io::{AsyncBufReadExt, AsyncRead, AsyncWrite, AsyncWriteExt, BufReader};

use crate::agents::AgentState;

pub async fn exchange_line<S>(stream: &mut S, request: &str) -> Result<String, String>
where
    S: AsyncRead + AsyncWrite + Unpin,
{
    stream
        .write_all(request.as_bytes())
        .await
        .map_err(|error| error.to_string())?;
    stream
        .write_all(b"\n")
        .await
        .map_err(|error| error.to_string())?;
    stream.flush().await.map_err(|error| error.to_string())?;
    let mut response = String::new();
    BufReader::new(stream)
        .read_line(&mut response)
        .await
        .map_err(|error| error.to_string())?;
    if response.is_empty() {
        return Err("Herdr closed before responding".into());
    }
    Ok(response)
}

#[derive(Debug, Deserialize)]
pub struct PingResponse {
    pub result: Option<PingResult>,
    #[serde(default)]
    error: Option<ApiError>,
}

impl PingResponse {
    pub fn into_result(self) -> Result<PingResult, String> {
        if let Some(error) = self.error {
            return Err(error.message);
        }
        self.result.ok_or("missing ping result".into())
    }
}

#[derive(Debug, Deserialize)]
pub struct PingResult {
    #[serde(rename = "type")]
    pub kind: String,
    pub version: String,
    pub protocol: u32,
}

#[derive(Debug, Deserialize)]
pub struct SnapshotResponse {
    pub result: Option<SnapshotResult>,
    #[serde(default)]
    error: Option<ApiError>,
}

impl SnapshotResponse {
    pub fn into_result(self) -> Result<SnapshotResult, String> {
        if let Some(error) = self.error {
            return Err(error.message);
        }
        self.result.ok_or("missing snapshot result".into())
    }
}

#[derive(Debug, Deserialize)]
pub struct SnapshotResult {
    pub snapshot: Snapshot,
}

#[derive(Debug, Deserialize)]
pub struct Snapshot {
    pub version: String,
    pub protocol: u32,
    #[serde(default)]
    pub panes: Vec<PaneRecord>,
    #[serde(default)]
    pub agents: Vec<AgentRecord>,
    #[serde(default)]
    pub workspaces: Vec<WorkspaceRecord>,
}

#[derive(Debug, Deserialize)]
pub struct WorkspaceRecord {
    pub workspace_id: String,
    pub label: String,
}

#[derive(Debug, Deserialize)]
pub struct PaneRecord {
    #[serde(alias = "pane_id")]
    pub id: String,
}

#[derive(Debug, Deserialize)]
pub struct AgentRecord {
    pub workspace_id: String,
    pub pane_id: String,
    #[serde(default)]
    pub agent: Option<String>,
    #[serde(default)]
    pub display_agent: Option<String>,
    #[serde(default)]
    pub title: Option<String>,
    pub agent_status: AgentState,
}

impl AgentRecord {
    pub fn into_agent_info(
        self,
        session_id: &str,
        workspace_label: Option<String>,
    ) -> crate::agents::AgentInfo {
        crate::agents::AgentInfo {
            session_id: session_id.into(),
            workspace_id: self.workspace_id,
            workspace_label,
            pane_id: self.pane_id,
            agent: self.display_agent.or(self.agent),
            title: self.title,
            state: self.agent_status,
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct SubscribeResponse {
    #[serde(default)]
    result: Option<serde_json::Value>,
    #[serde(default)]
    error: Option<ApiError>,
}

impl SubscribeResponse {
    pub fn ensure_ok(&self) -> Result<(), String> {
        if let Some(error) = &self.error {
            return Err(error.message.clone());
        }
        self.result
            .as_ref()
            .map(|_| ())
            .ok_or("missing subscription result".into())
    }
}

#[derive(Debug, Deserialize)]
struct ApiError {
    message: String,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "event", content = "data")]
pub enum EventMessage {
    #[serde(rename = "pane.agent_status_changed")]
    AgentStatus(AgentStatusData),
    #[serde(rename = "pane.created")]
    PaneCreated(PaneLifecycleData),
    #[serde(rename = "pane.closed")]
    PaneClosed(PaneLifecycleData),
    #[serde(rename = "pane.exited")]
    PaneExited(PaneLifecycleData),
    #[serde(rename = "pane.agent_detected")]
    AgentDetected(PaneLifecycleData),
    #[serde(other)]
    Other,
}

#[derive(Debug, Deserialize)]
pub struct AgentStatusData {
    pub pane_id: String,
    pub workspace_id: String,
    pub agent_status: AgentState,
    #[serde(default)]
    pub agent: Option<String>,
    #[serde(default)]
    pub display_agent: Option<String>,
    #[serde(default)]
    pub title: Option<String>,
}

impl AgentStatusData {
    pub fn into_agent_info(
        self,
        session_id: &str,
        workspace_label: Option<String>,
    ) -> crate::agents::AgentInfo {
        crate::agents::AgentInfo {
            session_id: session_id.into(),
            workspace_id: self.workspace_id,
            workspace_label,
            pane_id: self.pane_id,
            agent: self.display_agent.or(self.agent),
            title: self.title,
            state: self.agent_status,
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct PaneLifecycleData {
    pub pane_id: String,
}

pub fn subscribe_request(pane_ids: &[String]) -> String {
    let mut subscriptions = vec![
        serde_json::json!({ "type": "pane.created" }),
        serde_json::json!({ "type": "pane.closed" }),
        serde_json::json!({ "type": "pane.exited" }),
        serde_json::json!({ "type": "pane.agent_detected" }),
    ];
    subscriptions.extend(pane_ids.iter().map(
        |pane_id| serde_json::json!({ "type": "pane.agent_status_changed", "pane_id": pane_id }),
    ));
    serde_json::json!({
        "id": "subscribe_1",
        "method": "events.subscribe",
        "params": { "subscriptions": subscriptions }
    })
    .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_ping_metadata() {
        let response: PingResponse = serde_json::from_str(
            r#"{"id":"ping_1","result":{"type":"pong","version":"0.8.0","protocol":20}}"#,
        )
        .unwrap();
        let pong = response.into_result().unwrap();
        assert_eq!(pong.kind, "pong");
        assert_eq!(pong.protocol, 20);
    }

    #[test]
    fn parses_realistic_snapshot_shape() {
        let response: SnapshotResponse = serde_json::from_str(r#"{
          "id":"snapshot_1",
          "result":{"type":"session_snapshot","snapshot":{
            "version":"0.8.0","protocol":20,"panes":[{"pane_id":"w1:p1"}],
            "workspaces":[{"workspace_id":"w1","label":"host: project"}],
            "agents":[{"terminal_id":"t1","workspace_id":"w1","tab_id":"tab1","pane_id":"w1:p1","agent":"codex","agent_status":"working","focused":true,"revision":1}]
          }}
        }"#).unwrap();
        let snapshot = response.into_result().unwrap().snapshot;
        assert_eq!(snapshot.panes[0].id, "w1:p1");
        assert_eq!(snapshot.workspaces[0].label, "host: project");
        assert_eq!(snapshot.agents[0].agent_status, AgentState::Working);
    }

    #[test]
    fn status_event_keeps_the_cached_workspace_label() {
        let event: EventMessage = serde_json::from_str(r#"{
          "event":"pane.agent_status_changed",
          "data":{"pane_id":"w1:p2","workspace_id":"w1","agent_status":"working","display_agent":"grok","title":"Waiting for response"}
        }"#).unwrap();
        let EventMessage::AgentStatus(status) = event else {
            panic!("expected an agent status event");
        };
        let agent = status.into_agent_info("default", Some("rtx6000: vulseek-dev".into()));
        assert_eq!(
            agent.workspace_label.as_deref(),
            Some("rtx6000: vulseek-dev")
        );
        assert_eq!(agent.agent.as_deref(), Some("grok"));
        assert_eq!(agent.title.as_deref(), Some("Waiting for response"));
    }

    #[test]
    fn preserves_server_error_messages() {
        let response: SnapshotResponse = serde_json::from_str(
            r#"{"id":"snapshot_1","error":{"code":"incompatible_protocol","message":"upgrade required"}}"#,
        )
        .unwrap();
        assert_eq!(response.into_result().unwrap_err(), "upgrade required");
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn exchanges_ping_and_snapshot_with_a_fake_herdr_socket() {
        use std::sync::atomic::{AtomicU64, Ordering};
        use tokio::net::{UnixListener, UnixStream};

        static NEXT_ID: AtomicU64 = AtomicU64::new(1);
        let directory = std::env::temp_dir().join(format!(
            "herdr-pet-test-{}-{}",
            std::process::id(),
            NEXT_ID.fetch_add(1, Ordering::Relaxed)
        ));
        std::fs::create_dir(&directory).unwrap();
        let socket_path = directory.join("herdr.sock");
        let listener = UnixListener::bind(&socket_path).unwrap();
        let server = tokio::spawn(async move {
            for _ in 0..3 {
                let (mut stream, _) = listener.accept().await.unwrap();
                let mut request = String::new();
                BufReader::new(&mut stream)
                    .read_line(&mut request)
                    .await
                    .unwrap();
                let response = if request.contains("\"method\":\"ping\"") {
                    r#"{"id":"ping_1","result":{"type":"pong","version":"0.8.0","protocol":20}}"#
                } else if request.contains("\"method\":\"session.snapshot\"") {
                    r#"{"id":"snapshot_1","result":{"type":"session_snapshot","snapshot":{"version":"0.8.0","protocol":20,"panes":[],"agents":[]}}}"#
                } else {
                    r#"{"id":"subscribe_1","result":{"type":"subscribed"}}
{"event":"pane.agent_status_changed","data":{"pane_id":"w1:p1","workspace_id":"w1","agent_status":"working","agent":"codex"}}
{"event":"pane.agent_status_changed","data":{"pane_id":"w1:p1","workspace_id":"w1","agent_status":"done","agent":"codex"}}"#
                };
                stream.write_all(response.as_bytes()).await.unwrap();
                stream.write_all(b"\n").await.unwrap();
            }
        });

        let mut ping_stream = UnixStream::connect(&socket_path).await.unwrap();
        let ping = exchange_line(
            &mut ping_stream,
            r#"{"id":"ping_1","method":"ping","params":{}}"#,
        )
        .await
        .unwrap();
        let pong: PingResponse = serde_json::from_str(&ping).unwrap();
        assert_eq!(pong.into_result().unwrap().kind, "pong");

        let mut snapshot_stream = UnixStream::connect(&socket_path).await.unwrap();
        let snapshot = exchange_line(
            &mut snapshot_stream,
            r#"{"id":"snapshot_1","method":"session.snapshot","params":{}}"#,
        )
        .await
        .unwrap();
        let snapshot: SnapshotResponse = serde_json::from_str(&snapshot).unwrap();
        assert!(snapshot.into_result().unwrap().snapshot.agents.is_empty());

        let mut subscription_stream = UnixStream::connect(&socket_path).await.unwrap();
        subscription_stream
            .write_all(subscribe_request(&["w1:p1".into()]).as_bytes())
            .await
            .unwrap();
        subscription_stream.write_all(b"\n").await.unwrap();
        let mut lines = BufReader::new(subscription_stream).lines();
        let acknowledgement: SubscribeResponse =
            serde_json::from_str(&lines.next_line().await.unwrap().unwrap()).unwrap();
        acknowledgement.ensure_ok().unwrap();
        let mut cache = crate::agents::AgentCache::default();
        let mut intents = crate::pet::IntentFactory::default();
        let config = crate::config::AppConfig::default();
        let mut completion = None;
        for _ in 0..2 {
            let event: EventMessage =
                serde_json::from_str(&lines.next_line().await.unwrap().unwrap()).unwrap();
            if let EventMessage::AgentStatus(data) = event {
                let agent = crate::agents::AgentInfo {
                    session_id: "default".into(),
                    workspace_id: data.workspace_id,
                    workspace_label: None,
                    pane_id: data.pane_id,
                    agent: data.display_agent.or(data.agent),
                    title: data.title,
                    state: data.agent_status,
                };
                if let Some(transition) = cache.update(agent.clone()) {
                    completion = intents.create_from_transition(transition, &agent, &config);
                }
            }
        }
        let completion = completion.expect("working -> done should create an intent");
        assert_eq!(completion.kind, "turn_completed_background");
        assert_eq!(completion.animation, "celebrate");
        assert_eq!(completion.agent_names, ["codex"]);

        server.await.unwrap();
        std::fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn subscribes_to_each_existing_pane_and_topology_events() {
        let request = subscribe_request(&["w1:p1".into(), "w1:p2".into()]);
        let value: serde_json::Value = serde_json::from_str(&request).unwrap();
        let subscriptions = value["params"]["subscriptions"].as_array().unwrap();
        assert_eq!(subscriptions.len(), 6);
        assert!(subscriptions.iter().any(|item| item["pane_id"] == "w1:p2"));
    }

    #[test]
    fn parses_agent_status_subscription_event() {
        let event: EventMessage = serde_json::from_str(r#"{
          "event":"pane.agent_status_changed",
          "data":{"pane_id":"w1:p1","workspace_id":"w1","agent_status":"done","agent":"codex","state_labels":{}}
        }"#).unwrap();
        assert!(
            matches!(event, EventMessage::AgentStatus(data) if data.agent_status == AgentState::Done)
        );
    }
}
