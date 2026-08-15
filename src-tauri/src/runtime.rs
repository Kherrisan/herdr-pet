use std::sync::Arc;

use serde::Serialize;
use tauri::async_runtime::JoinHandle;
use tauri::{AppHandle, Emitter};
use tokio::sync::{Mutex, Notify, RwLock};

use crate::{
    agents::{AgentCache, AgentInfo, AggregateState},
    config::AppConfig,
    pet::IntentFactory,
};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionStatus {
    pub state: ConnectionState,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub socket_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub protocol: Option<u32>,
    pub agent_count: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub retry_in_ms: Option<u64>,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ConnectionState {
    Disconnected,
    Connecting,
    Connected,
}

impl Default for ConnectionStatus {
    fn default() -> Self {
        Self {
            state: ConnectionState::Disconnected,
            socket_path: None,
            version: None,
            protocol: None,
            agent_count: 0,
            last_error: None,
            retry_in_ms: None,
        }
    }
}

pub struct RuntimeState {
    pub config: RwLock<AppConfig>,
    pub config_update: Mutex<()>,
    pub agents: RwLock<AgentCache>,
    pub connection: RwLock<ConnectionStatus>,
    pub intents: RwLock<IntentFactory>,
    pub reconnect: Notify,
    pub position_save: std::sync::Mutex<Option<JoinHandle<()>>>,
    pub metrics: RwLock<RuntimeMetrics>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeMetrics {
    pub started_at_ms: u64,
    pub reconnect_count: u64,
    pub last_event_kind: Option<String>,
    pub last_event_at_ms: Option<u64>,
    pub avatar_runtime_error: Option<String>,
}

fn unix_time_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or_default()
}

impl RuntimeState {
    pub fn new(config: AppConfig) -> Arc<Self> {
        Arc::new(Self {
            config: RwLock::new(config),
            config_update: Mutex::new(()),
            agents: RwLock::new(AgentCache::default()),
            connection: RwLock::new(ConnectionStatus::default()),
            intents: RwLock::new(IntentFactory::default()),
            reconnect: Notify::new(),
            position_save: std::sync::Mutex::new(None),
            metrics: RwLock::new(RuntimeMetrics {
                started_at_ms: unix_time_ms(),
                reconnect_count: 0,
                last_event_kind: None,
                last_event_at_ms: None,
                avatar_runtime_error: None,
            }),
        })
    }

    pub async fn emit_runtime(&self, app: &AppHandle) {
        let connected = self.connection.read().await.state == ConnectionState::Connected;
        let quiet = self.config.read().await.herdr.observation.quiet();
        let agents = self.agents.read().await.list();
        let aggregate = if quiet {
            self.agents.read().await.aggregate_quiet(connected)
        } else {
            self.agents.read().await.aggregate(connected)
        };
        {
            let mut connection = self.connection.write().await;
            connection.agent_count = agents.len();
        }
        let _ = app.emit("herdr://agents-changed", &agents);
        let _ = app.emit("pet://aggregate-state", aggregate);
        let _ = app.emit(
            "herdr://connection-changed",
            self.connection.read().await.clone(),
        );
    }

    pub async fn set_disconnected(&self, app: &AppHandle, error: String, retry_in_ms: u64) {
        {
            let mut connection = self.connection.write().await;
            connection.state = ConnectionState::Disconnected;
            connection.last_error = Some(error);
            connection.retry_in_ms = Some(retry_in_ms);
        }
        self.metrics.write().await.reconnect_count += 1;
        self.emit_runtime(app).await;
    }

    pub async fn record_event(&self, kind: &str) {
        let mut metrics = self.metrics.write().await;
        metrics.last_event_kind = Some(kind.to_string());
        metrics.last_event_at_ms = Some(unix_time_ms());
    }

    pub async fn report_avatar_runtime_error(&self, error: Option<String>) {
        let error = error.map(|mut value| {
            value.truncate(500);
            value
        });
        self.metrics.write().await.avatar_runtime_error = error;
    }

    pub async fn agents(&self) -> Vec<AgentInfo> {
        self.agents.read().await.list()
    }

    pub async fn aggregate(&self) -> AggregateState {
        let connected = self.connection.read().await.state == ConnectionState::Connected;
        let quiet = self.config.read().await.herdr.observation.quiet();
        if quiet {
            self.agents.read().await.aggregate_quiet(connected)
        } else {
            self.agents.read().await.aggregate(connected)
        }
    }
}
