use serde::{Deserialize, Serialize};

#[cfg(feature = "desktop")]
use std::{fs, io::Write, path::PathBuf};
#[cfg(feature = "desktop")]
use tauri::{AppHandle, Manager};
#[cfg(feature = "desktop")]
use tempfile::NamedTempFile;

pub const CURRENT_SCHEMA_VERSION: u32 = 4;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct AppConfig {
    pub schema_version: u32,
    pub language: AppLanguage,
    pub overlay: OverlayConfig,
    pub herdr: HerdrConfig,
    pub avatar: AvatarConfig,
    pub events: EventRules,
    pub scheduler: SchedulerConfig,
    pub desktop: DesktopConfig,
    pub audio: AudioConfig,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
pub enum AppLanguage {
    #[default]
    #[serde(rename = "zh-CN")]
    Chinese,
    #[serde(rename = "en")]
    English,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", default)]
pub struct DesktopConfig {
    pub auto_start: bool,
    pub paused: bool,
    pub toggle_shortcut: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct AudioConfig {
    pub enabled: bool,
    pub volume: f64,
    pub agent_detected: bool,
    pub turn_completed: bool,
    pub attention_requested: bool,
    pub agent_started: bool,
    pub agent_exited: bool,
    pub reconnected: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct OverlayConfig {
    pub always_on_top: bool,
    pub click_through: bool,
    pub locked: bool,
    pub scale: f64,
    pub opacity: f64,
    pub fps: u32,
    pub position: Option<OverlayPosition>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct OverlayPosition {
    pub x: i32,
    pub y: i32,
    pub monitor_id: Option<String>,
    pub scale_factor: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct HerdrConfig {
    pub auto_discover: bool,
    pub session: Option<String>,
    pub socket_path: Option<String>,
    pub wsl: WslConfig,
    pub observation: ObservationConfig,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", default)]
pub struct WslConfig {
    pub enabled: bool,
    pub distribution: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", default)]
pub struct ObservationConfig {
    pub mode: ObservationMode,
    pub current_workspace_id: Option<String>,
    pub workspace_ids: Vec<String>,
    pub pane_ids: Vec<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum ObservationMode {
    #[default]
    All,
    CurrentWorkspace,
    Selected,
    Quiet,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct AvatarConfig {
    pub installation_id: Option<String>,
    pub avatar_id: Option<String>,
    pub animation_speed: f64,
    pub state_animations: StateAnimations,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", default)]
pub struct StateAnimations {
    pub sleeping: String,
    pub idle: String,
    pub working: String,
    pub needs_attention: String,
    pub offline: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct EventRules {
    pub agent_detected: EventRule,
    pub turn_completed: EventRule,
    pub attention_requested: EventRule,
    pub agent_started: EventRule,
    pub agent_exited: EventRule,
    pub reconnected: EventRule,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct EventRule {
    pub enabled: bool,
    pub animation: String,
    pub bubble: String,
    pub duration_ms: u64,
    pub cooldown_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", default)]
pub struct SchedulerConfig {
    pub max_queue: usize,
    pub completion_merge_ms: u64,
    pub event_ttl_ms: u64,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            schema_version: CURRENT_SCHEMA_VERSION,
            language: AppLanguage::default(),
            overlay: OverlayConfig::default(),
            herdr: HerdrConfig::default(),
            avatar: AvatarConfig::default(),
            events: EventRules::default(),
            scheduler: SchedulerConfig::default(),
            desktop: DesktopConfig::default(),
            audio: AudioConfig::default(),
        }
    }
}

impl Default for AudioConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            volume: 0.35,
            agent_detected: false,
            turn_completed: true,
            attention_requested: true,
            agent_started: false,
            agent_exited: false,
            reconnected: false,
        }
    }
}

impl Default for DesktopConfig {
    fn default() -> Self {
        Self {
            auto_start: false,
            paused: false,
            toggle_shortcut: "CmdOrCtrl+Shift+H".into(),
        }
    }
}

impl Default for OverlayConfig {
    fn default() -> Self {
        Self {
            always_on_top: true,
            click_through: false,
            locked: false,
            scale: 1.0,
            opacity: 1.0,
            fps: 30,
            position: None,
        }
    }
}

impl Default for HerdrConfig {
    fn default() -> Self {
        Self {
            auto_discover: true,
            session: None,
            socket_path: None,
            wsl: WslConfig::default(),
            observation: ObservationConfig::default(),
        }
    }
}

impl Default for ObservationConfig {
    fn default() -> Self {
        Self {
            mode: ObservationMode::All,
            current_workspace_id: None,
            workspace_ids: Vec::new(),
            pane_ids: Vec::new(),
        }
    }
}

impl ObservationConfig {
    pub fn includes(&self, workspace_id: &str, pane_id: &str) -> bool {
        match self.mode {
            ObservationMode::All | ObservationMode::Quiet => true,
            ObservationMode::CurrentWorkspace => self
                .current_workspace_id
                .as_deref()
                .is_some_and(|selected| selected == workspace_id),
            ObservationMode::Selected => {
                self.workspace_ids
                    .iter()
                    .any(|selected| selected == workspace_id)
                    || self.pane_ids.iter().any(|selected| selected == pane_id)
            }
        }
    }

    pub fn quiet(&self) -> bool {
        self.mode == ObservationMode::Quiet
    }

    fn normalize(&mut self) {
        self.current_workspace_id = self.current_workspace_id.take().filter(|id| !id.is_empty());
        normalize_ids(&mut self.workspace_ids);
        normalize_ids(&mut self.pane_ids);
    }
}

fn normalize_ids(ids: &mut Vec<String>) {
    ids.retain(|id| !id.is_empty());
    ids.iter_mut().for_each(|id| id.truncate(128));
    ids.sort();
    ids.dedup();
    ids.truncate(256);
}

impl Default for AvatarConfig {
    fn default() -> Self {
        Self {
            installation_id: None,
            avatar_id: None,
            animation_speed: 1.0,
            state_animations: StateAnimations::default(),
        }
    }
}

impl Default for StateAnimations {
    fn default() -> Self {
        Self {
            sleeping: "sleeping".into(),
            idle: "idle".into(),
            working: "working".into(),
            needs_attention: "surprised".into(),
            offline: "sad".into(),
        }
    }
}

impl Default for EventRules {
    fn default() -> Self {
        Self {
            agent_detected: EventRule {
                enabled: true,
                animation: "waking".into(),
                bubble: "{agent} 已连接".into(),
                duration_ms: 1_000,
                cooldown_ms: 1_000,
            },
            turn_completed: EventRule {
                enabled: true,
                animation: "celebrate".into(),
                bubble: "{agent} 完成了工作".into(),
                duration_ms: 2_200,
                cooldown_ms: 1_000,
            },
            attention_requested: EventRule {
                enabled: true,
                animation: "surprised".into(),
                bubble: "{agent} 需要你的关注".into(),
                duration_ms: 3_000,
                cooldown_ms: 1_000,
            },
            agent_started: EventRule {
                enabled: true,
                animation: "excited".into(),
                bubble: "{agent} 开始工作".into(),
                duration_ms: 1_200,
                cooldown_ms: 600,
            },
            agent_exited: EventRule {
                enabled: true,
                animation: "drowsy".into(),
                bubble: "{agent} 已退出".into(),
                duration_ms: 1_000,
                cooldown_ms: 1_000,
            },
            reconnected: EventRule {
                enabled: true,
                animation: "waking".into(),
                bubble: String::new(),
                duration_ms: 1_000,
                cooldown_ms: 1_000,
            },
        }
    }
}

impl Default for EventRule {
    fn default() -> Self {
        Self {
            enabled: true,
            animation: "idle".into(),
            bubble: String::new(),
            duration_ms: 1_000,
            cooldown_ms: 1_000,
        }
    }
}

impl Default for SchedulerConfig {
    fn default() -> Self {
        Self {
            max_queue: 8,
            completion_merge_ms: 1_000,
            event_ttl_ms: 15_000,
        }
    }
}

impl AppConfig {
    pub fn normalized(mut self) -> Self {
        self.schema_version = CURRENT_SCHEMA_VERSION;
        self.overlay.scale = self.overlay.scale.clamp(0.3, 2.0);
        self.overlay.opacity = self.overlay.opacity.clamp(0.35, 1.0);
        self.overlay.fps = if self.overlay.fps <= 30 { 30 } else { 60 };
        self.avatar.animation_speed = self.avatar.animation_speed.clamp(0.25, 3.0);
        self.herdr.session = normalize_optional_text(self.herdr.session.take(), 128);
        self.herdr.socket_path = normalize_optional_text(self.herdr.socket_path.take(), 1_024);
        self.herdr.wsl.distribution =
            normalize_optional_text(self.herdr.wsl.distribution.take(), 128);
        self.herdr.observation.normalize();
        self.avatar.state_animations.normalize();
        self.events.turn_completed.normalize();
        self.events.attention_requested.normalize();
        self.events.agent_started.normalize();
        self.events.agent_detected.normalize();
        self.events.agent_exited.normalize();
        self.events.reconnected.normalize();
        self.scheduler.max_queue = self.scheduler.max_queue.clamp(1, 64);
        self.scheduler.completion_merge_ms = self.scheduler.completion_merge_ms.clamp(100, 10_000);
        self.scheduler.event_ttl_ms = self.scheduler.event_ttl_ms.clamp(1_000, 300_000);
        self.desktop.toggle_shortcut = self
            .desktop
            .toggle_shortcut
            .trim()
            .chars()
            .take(64)
            .collect();
        if self.desktop.toggle_shortcut.is_empty() {
            self.desktop.toggle_shortcut = "CmdOrCtrl+Shift+H".into();
        }
        self.audio.volume = self.audio.volume.clamp(0.0, 1.0);
        self
    }
}

fn normalize_optional_text(value: Option<String>, max_chars: usize) -> Option<String> {
    value.and_then(|value| {
        let normalized = value
            .trim()
            .chars()
            .filter(|character| !character.is_control())
            .take(max_chars)
            .collect::<String>();
        (!normalized.is_empty()).then_some(normalized)
    })
}

impl StateAnimations {
    fn normalize(&mut self) {
        for animation in [
            &mut self.sleeping,
            &mut self.idle,
            &mut self.working,
            &mut self.needs_attention,
            &mut self.offline,
        ] {
            animation.truncate(64);
            if animation.is_empty() {
                *animation = "idle".into();
            }
        }
    }
}

impl EventRule {
    fn normalize(&mut self) {
        self.duration_ms = self.duration_ms.clamp(100, 30_000);
        self.cooldown_ms = self.cooldown_ms.min(60_000);
        self.bubble.truncate(120);
        self.animation.truncate(64);
        if self.animation.is_empty() {
            self.animation = "idle".into();
        }
    }
}

fn decode(bytes: &[u8]) -> Result<AppConfig, String> {
    let value: serde_json::Value =
        serde_json::from_slice(bytes).map_err(|error| error.to_string())?;
    let version = value
        .get("schemaVersion")
        .and_then(serde_json::Value::as_u64)
        .unwrap_or(1);
    if version > u64::from(CURRENT_SCHEMA_VERSION) {
        return Err(format!("unsupported config schema version {version}"));
    }
    serde_json::from_value::<AppConfig>(value)
        .map(AppConfig::normalized)
        .map_err(|error| error.to_string())
}

#[cfg(feature = "desktop")]
fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|dir| dir.join("config.json"))
        .map_err(|error| error.to_string())
}

#[cfg(feature = "desktop")]
pub fn load(app: &AppHandle) -> AppConfig {
    let Ok(path) = config_path(app) else {
        return AppConfig::default();
    };
    load_at(&path)
}

#[cfg(feature = "desktop")]
fn load_at(path: &std::path::Path) -> AppConfig {
    let Ok(bytes) = fs::read(path) else {
        return AppConfig::default();
    };
    match decode(&bytes) {
        Ok(config) => config,
        Err(error) => {
            let timestamp = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|duration| duration.as_secs())
                .unwrap_or_default();
            let backup = path.with_file_name(format!("config.backup-{timestamp}.json"));
            if let Err(backup_error) = fs::copy(path, backup) {
                tracing::warn!(%backup_error, "failed to back up invalid config");
            }
            tracing::warn!(%error, "failed to load app config; using defaults");
            AppConfig::default()
        }
    }
}

#[cfg(feature = "desktop")]
pub fn save(app: &AppHandle, config: &AppConfig) -> Result<(), String> {
    let path = config_path(app)?;
    save_at(&path, config)
}

#[cfg(feature = "desktop")]
fn save_at(path: &std::path::Path, config: &AppConfig) -> Result<(), String> {
    let parent = path.parent().ok_or("invalid config path")?;
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    let mut temporary = NamedTempFile::new_in(parent).map_err(|error| error.to_string())?;
    serde_json::to_writer_pretty(&mut temporary, config).map_err(|error| error.to_string())?;
    temporary.flush().map_err(|error| error.to_string())?;
    temporary
        .as_file()
        .sync_all()
        .map_err(|error| error.to_string())?;
    temporary
        .persist(path)
        .map(|_| ())
        .map_err(|error| error.error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_user_controlled_numeric_values() {
        let mut config = AppConfig::default();
        config.overlay.scale = 10.0;
        config.overlay.opacity = -2.0;
        config.overlay.fps = 44;
        config.events.turn_completed.duration_ms = 1;
        let config = config.normalized();
        assert_eq!(config.overlay.scale, 2.0);
        assert_eq!(config.overlay.opacity, 0.35);
        assert_eq!(config.overlay.fps, 60);
        assert_eq!(config.events.turn_completed.duration_ms, 100);
        assert_eq!(config.scheduler.max_queue, 8);

        let mut minimum = AppConfig::default();
        minimum.overlay.scale = 0.0;
        assert_eq!(minimum.normalized().overlay.scale, 0.3);
    }

    #[test]
    fn normalizes_unicode_shortcuts_without_splitting_a_character() {
        let mut config = AppConfig::default();
        config.desktop.toggle_shortcut = format!("  {}  ", "键".repeat(80));
        let normalized = config.normalized();
        assert_eq!(normalized.desktop.toggle_shortcut.chars().count(), 64);
        assert!(
            normalized
                .desktop
                .toggle_shortcut
                .chars()
                .all(|character| character == '键')
        );
    }

    #[test]
    fn serializes_fields_for_typescript_consumers() {
        let value = serde_json::to_value(AppConfig::default()).unwrap();
        assert_eq!(value["schemaVersion"], CURRENT_SCHEMA_VERSION);
        assert_eq!(value["language"], "zh-CN");
        assert!(value["events"].get("turnCompleted").is_some());
        assert!(value["overlay"].get("alwaysOnTop").is_some());
        assert!(value["overlay"].get("position").is_some());
        assert!(value["avatar"].get("installationId").is_some());
        assert!(value["avatar"].get("stateAnimations").is_some());
        assert_eq!(value["herdr"]["wsl"]["enabled"], false);
    }

    #[test]
    fn migrates_schema_v1_without_discarding_existing_settings() {
        let source = br#"{
          "schemaVersion": 1,
          "overlay": {"alwaysOnTop": false, "clickThrough": true, "locked": false, "scale": 1.2, "opacity": 0.8, "fps": 30, "position": null},
          "herdr": {"autoDiscover": true, "session": null, "socketPath": null},
          "avatar": {"animationSpeed": 1.5},
          "events": {
            "turnCompleted": {"enabled": true, "animation": "happy", "bubble": "done", "durationMs": 900, "cooldownMs": 500},
            "attentionRequested": {"enabled": true, "animation": "surprised", "bubble": "help", "durationMs": 1200, "cooldownMs": 500},
            "agentStarted": {"enabled": false, "animation": "excited", "bubble": "start", "durationMs": 700, "cooldownMs": 300}
          }
        }"#;
        let config = decode(source).unwrap();
        assert_eq!(config.schema_version, CURRENT_SCHEMA_VERSION);
        assert_eq!(config.overlay.scale, 1.2);
        assert!(config.overlay.click_through);
        assert_eq!(config.avatar.animation_speed, 1.5);
        assert_eq!(config.avatar.state_animations.working, "working");
        assert_eq!(config.events.turn_completed.animation, "happy");
    }

    #[test]
    fn rejects_unknown_future_schema() {
        let source = br#"{"schemaVersion": 999}"#;
        assert!(decode(source).unwrap_err().contains("unsupported"));
    }

    #[test]
    fn migrates_schema_v2_with_wsl_disabled() {
        let source = br#"{
          "schemaVersion": 2,
          "herdr": {"autoDiscover": true, "session": null, "socketPath": null}
        }"#;
        let config = decode(source).unwrap();
        assert_eq!(config.schema_version, CURRENT_SCHEMA_VERSION);
        assert!(!config.herdr.wsl.enabled);
        assert_eq!(config.herdr.wsl.distribution, None);
    }

    #[test]
    fn migrates_schema_v3_with_chinese_as_default_language() {
        let source = br#"{"schemaVersion":3}"#;
        let config = decode(source).unwrap();
        assert_eq!(config.schema_version, CURRENT_SCHEMA_VERSION);
        assert_eq!(config.language, AppLanguage::Chinese);
    }

    #[test]
    fn normalizes_wsl_connection_fields() {
        let mut config = AppConfig::default();
        config.herdr.wsl.enabled = true;
        config.herdr.wsl.distribution = Some("  Ubuntu\n  ".into());
        config.herdr.socket_path = Some("  ~/.config/herdr/herdr.sock  ".into());
        let config = config.normalized();
        assert_eq!(config.herdr.wsl.distribution.as_deref(), Some("Ubuntu"));
        assert_eq!(
            config.herdr.socket_path.as_deref(),
            Some("~/.config/herdr/herdr.sock")
        );
    }

    #[test]
    fn observation_scope_matches_workspace_and_pane_selections() {
        let mut observation = ObservationConfig {
            mode: ObservationMode::Selected,
            workspace_ids: vec!["workspace-a".into()],
            pane_ids: vec!["pane-b".into()],
            ..ObservationConfig::default()
        };
        assert!(observation.includes("workspace-a", "pane-x"));
        assert!(observation.includes("workspace-x", "pane-b"));
        assert!(!observation.includes("workspace-x", "pane-x"));

        observation.mode = ObservationMode::CurrentWorkspace;
        observation.current_workspace_id = Some("workspace-c".into());
        assert!(observation.includes("workspace-c", "pane-x"));
        assert!(!observation.includes("workspace-a", "pane-x"));
    }

    #[cfg(feature = "desktop")]
    #[test]
    fn saves_atomically_and_backs_up_a_corrupt_config() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("config.json");
        let mut config = AppConfig::default();
        config.overlay.scale = 1.2;
        save_at(&path, &config).unwrap();
        assert_eq!(load_at(&path).overlay.scale, 1.2);

        fs::write(&path, b"{ truncated").unwrap();
        let recovered = load_at(&path);
        assert_eq!(recovered, AppConfig::default());
        assert!(fs::read_dir(directory.path()).unwrap().any(|entry| {
            entry
                .unwrap()
                .file_name()
                .to_string_lossy()
                .starts_with("config.backup-")
        }));
        assert_eq!(fs::read(&path).unwrap(), b"{ truncated");
    }
}
