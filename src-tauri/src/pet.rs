use std::{
    collections::HashMap,
    time::{Duration, Instant},
};

use serde::Serialize;

use crate::{
    agents::{AgentInfo, TransitionKind},
    config::AppConfig,
};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PetIntent {
    pub id: u64,
    pub kind: &'static str,
    pub animation: String,
    pub priority: u8,
    pub duration_ms: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bubble: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bubble_template: Option<String>,
    pub count: u32,
    pub agent_names: Vec<String>,
    pub workspace_ids: Vec<String>,
}

#[derive(Default)]
pub struct IntentFactory {
    next_id: u64,
    last_emitted: HashMap<String, Instant>,
}

impl IntentFactory {
    pub fn reconnected(&mut self, config: &AppConfig) -> Option<PetIntent> {
        self.create_lifecycle("reconnected", 40, None, &config.events.reconnected)
    }

    pub fn agent_detected(&mut self, pane_id: &str, config: &AppConfig) -> Option<PetIntent> {
        let agent = AgentInfo {
            session_id: "topology".into(),
            workspace_id: String::new(),
            workspace_label: None,
            pane_id: pane_id.into(),
            agent: None,
            title: None,
            state: crate::agents::AgentState::Unknown,
        };
        self.create_lifecycle(
            "agent_detected",
            40,
            Some(&agent),
            &config.events.agent_detected,
        )
    }

    pub fn agent_exited(&mut self, agent: &AgentInfo, config: &AppConfig) -> Option<PetIntent> {
        self.create_lifecycle("agent_exited", 40, Some(agent), &config.events.agent_exited)
    }

    pub fn create_from_transition(
        &mut self,
        transition: TransitionKind,
        agent: &AgentInfo,
        config: &AppConfig,
    ) -> Option<PetIntent> {
        let (kind, priority, rule) = match transition {
            TransitionKind::AgentStarted => ("agent_started", 50, &config.events.agent_started),
            TransitionKind::TurnCompleted => ("turn_completed", 70, &config.events.turn_completed),
            TransitionKind::TurnCompletedBackground => (
                "turn_completed_background",
                70,
                &config.events.turn_completed,
            ),
            TransitionKind::AttentionRequested => (
                "attention_requested",
                100,
                &config.events.attention_requested,
            ),
        };
        if !rule.enabled {
            return None;
        }
        let now = Instant::now();
        // Cool down repeated transitions from one pane without suppressing a
        // different agent that happens to emit the same event concurrently.
        let cooldown_key = format!("{kind}:{}:{}", agent.session_id, agent.pane_id);
        if self
            .last_emitted
            .get(&cooldown_key)
            .is_some_and(|previous| {
                now.duration_since(*previous) < Duration::from_millis(rule.cooldown_ms)
            })
        {
            return None;
        }
        self.last_emitted.insert(cooldown_key, now);
        self.next_id += 1;
        let agent_name = agent.agent.as_deref().unwrap_or("Agent");
        Some(PetIntent {
            id: self.next_id,
            kind,
            animation: rule.animation.clone(),
            priority,
            duration_ms: rule.duration_ms,
            bubble: (!rule.bubble.is_empty())
                .then(|| render_bubble(&rule.bubble, agent_name, &agent.workspace_id, 1)),
            bubble_template: (!rule.bubble.is_empty()).then(|| rule.bubble.clone()),
            count: 1,
            agent_names: vec![agent_name.to_string()],
            workspace_ids: vec![agent.workspace_id.clone()],
        })
    }

    fn create_lifecycle(
        &mut self,
        kind: &'static str,
        priority: u8,
        agent: Option<&AgentInfo>,
        rule: &crate::config::EventRule,
    ) -> Option<PetIntent> {
        if !rule.enabled {
            return None;
        }
        let now = Instant::now();
        let pane_id = agent
            .map(|value| value.pane_id.as_str())
            .unwrap_or("global");
        let cooldown_key = format!("{kind}:{pane_id}");
        if self
            .last_emitted
            .get(&cooldown_key)
            .is_some_and(|previous| {
                now.duration_since(*previous) < Duration::from_millis(rule.cooldown_ms)
            })
        {
            return None;
        }
        self.last_emitted.insert(cooldown_key, now);
        self.next_id += 1;
        let agent_name = agent
            .and_then(|value| value.agent.as_deref())
            .unwrap_or("Agent");
        let workspace = agent.map(|value| value.workspace_id.as_str()).unwrap_or("");
        Some(PetIntent {
            id: self.next_id,
            kind,
            animation: rule.animation.clone(),
            priority,
            duration_ms: rule.duration_ms,
            bubble: (!rule.bubble.is_empty())
                .then(|| render_bubble(&rule.bubble, agent_name, workspace, 1)),
            bubble_template: (!rule.bubble.is_empty()).then(|| rule.bubble.clone()),
            count: 1,
            agent_names: agent.map(|_| vec![agent_name.into()]).unwrap_or_default(),
            workspace_ids: if workspace.is_empty() {
                Vec::new()
            } else {
                vec![workspace.into()]
            },
        })
    }
}

fn render_bubble(template: &str, agent: &str, workspace: &str, count: u32) -> String {
    template
        .replace("{agent}", agent)
        .replace("{workspace}", workspace)
        .replace("{count}", &count.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agents::AgentState;

    fn agent() -> AgentInfo {
        AgentInfo {
            session_id: "default".into(),
            workspace_id: "w1".into(),
            workspace_label: Some("host: project".into()),
            pane_id: "p1".into(),
            agent: Some("Codex".into()),
            title: None,
            state: AgentState::Done,
        }
    }

    #[test]
    fn creates_a_templated_completion_intent() {
        let mut factory = IntentFactory::default();
        let intent = factory
            .create_from_transition(
                TransitionKind::TurnCompleted,
                &agent(),
                &AppConfig::default(),
            )
            .unwrap();
        assert_eq!(intent.kind, "turn_completed");
        assert_eq!(intent.bubble.as_deref(), Some("Codex 完成了工作"));
        assert_eq!(intent.agent_names, ["Codex"]);
    }

    #[test]
    fn expands_all_supported_bubble_variables() {
        assert_eq!(
            render_bubble("{agent} · {workspace} · {count}", "Codex", "pet", 2),
            "Codex · pet · 2"
        );
    }

    #[test]
    fn honors_disabled_rules() {
        let mut config = AppConfig::default();
        config.events.turn_completed.enabled = false;
        assert!(
            IntentFactory::default()
                .create_from_transition(TransitionKind::TurnCompleted, &agent(), &config)
                .is_none()
        );
    }

    #[test]
    fn creates_a_reconnect_waking_intent() {
        let intent = IntentFactory::default()
            .reconnected(&AppConfig::default())
            .unwrap();
        assert_eq!(intent.kind, "reconnected");
        assert_eq!(intent.animation, "waking");
    }

    #[test]
    fn lifecycle_intents_use_templates_cooldowns_and_enabled_flags() {
        let mut factory = IntentFactory::default();
        let mut config = AppConfig::default();
        config.events.agent_exited.bubble = "{agent} 离开 {workspace}".into();
        let first = factory.agent_exited(&agent(), &config).unwrap();
        assert_eq!(first.bubble.as_deref(), Some("Codex 离开 w1"));
        assert!(factory.agent_exited(&agent(), &config).is_none());

        config.events.agent_detected.enabled = false;
        assert!(factory.agent_detected("p2", &config).is_none());
        config.events.reconnected.enabled = false;
        assert!(factory.reconnected(&config).is_none());
    }

    #[test]
    fn cooldown_does_not_drop_a_different_agent() {
        let mut factory = IntentFactory::default();
        let config = AppConfig::default();
        let first = agent();
        let mut second = agent();
        second.pane_id = "p2".into();
        second.agent = Some("Claude".into());

        assert!(
            factory
                .create_from_transition(TransitionKind::TurnCompleted, &first, &config)
                .is_some()
        );
        assert!(
            factory
                .create_from_transition(TransitionKind::TurnCompleted, &second, &config)
                .is_some()
        );
        assert!(
            factory
                .create_from_transition(TransitionKind::TurnCompleted, &first, &config)
                .is_none()
        );
    }
}
