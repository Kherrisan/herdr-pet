use std::collections::HashMap;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum AgentState {
    Idle,
    Working,
    Blocked,
    Done,
    #[serde(other)]
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentInfo {
    pub session_id: String,
    pub workspace_id: String,
    pub workspace_label: Option<String>,
    pub pane_id: String,
    pub agent: Option<String>,
    pub title: Option<String>,
    pub state: AgentState,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AggregateState {
    Sleeping,
    Idle,
    Working,
    NeedsAttention,
    Offline,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TransitionKind {
    AgentStarted,
    TurnCompleted,
    TurnCompletedBackground,
    AttentionRequested,
}

#[derive(Default)]
pub struct AgentCache {
    agents: HashMap<String, AgentInfo>,
}

impl AgentCache {
    pub fn replace(&mut self, agents: Vec<AgentInfo>) {
        self.agents = agents
            .into_iter()
            .map(|agent| (cache_key(&agent.session_id, &agent.pane_id), agent))
            .collect();
    }

    pub fn update(&mut self, next: AgentInfo) -> Option<TransitionKind> {
        let key = cache_key(&next.session_id, &next.pane_id);
        let mut next = next;
        if next.workspace_label.is_none() {
            next.workspace_label = self
                .agents
                .get(&key)
                .and_then(|previous| previous.workspace_label.clone());
        }
        let transition = self
            .agents
            .get(&key)
            .and_then(|previous| classify_transition(previous.state, next.state));
        self.agents.insert(key, next);
        transition
    }

    pub fn remove(&mut self, session_id: &str, pane_id: &str) -> Option<AgentInfo> {
        self.agents.remove(&cache_key(session_id, pane_id))
    }

    pub fn list(&self) -> Vec<AgentInfo> {
        let mut agents = self.agents.values().cloned().collect::<Vec<_>>();
        agents.sort_by(|left, right| left.pane_id.cmp(&right.pane_id));
        agents
    }

    pub fn aggregate(&self, connected: bool) -> AggregateState {
        if !connected {
            return AggregateState::Offline;
        }
        if self.agents.is_empty() {
            return AggregateState::Sleeping;
        }
        if self
            .agents
            .values()
            .any(|agent| agent.state == AgentState::Blocked)
        {
            return AggregateState::NeedsAttention;
        }
        if self
            .agents
            .values()
            .any(|agent| agent.state == AgentState::Working)
        {
            return AggregateState::Working;
        }
        AggregateState::Idle
    }

    pub fn aggregate_quiet(&self, connected: bool) -> AggregateState {
        match self.aggregate(connected) {
            AggregateState::Working => AggregateState::Idle,
            state => state,
        }
    }
}

fn cache_key(session_id: &str, pane_id: &str) -> String {
    format!("{session_id}:{pane_id}")
}

pub fn classify_transition(from: AgentState, to: AgentState) -> Option<TransitionKind> {
    if from == to {
        return None;
    }
    match (from, to) {
        (AgentState::Working, AgentState::Idle) => Some(TransitionKind::TurnCompleted),
        (AgentState::Working, AgentState::Done) => Some(TransitionKind::TurnCompletedBackground),
        (_, AgentState::Working) => Some(TransitionKind::AgentStarted),
        (_, AgentState::Blocked) => Some(TransitionKind::AttentionRequested),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn agent(pane: &str, state: AgentState) -> AgentInfo {
        AgentInfo {
            session_id: "default".into(),
            workspace_id: "w1".into(),
            workspace_label: Some("host: project".into()),
            pane_id: pane.into(),
            agent: Some("codex".into()),
            title: None,
            state,
        }
    }

    #[test]
    fn detects_foreground_and_background_turn_completion() {
        assert_eq!(
            classify_transition(AgentState::Working, AgentState::Idle),
            Some(TransitionKind::TurnCompleted)
        );
        assert_eq!(
            classify_transition(AgentState::Working, AgentState::Done),
            Some(TransitionKind::TurnCompletedBackground)
        );
    }

    #[test]
    fn does_not_treat_snapshot_idle_as_completion() {
        let mut cache = AgentCache::default();
        cache.replace(vec![agent("p1", AgentState::Idle)]);
        assert_eq!(cache.aggregate(true), AggregateState::Idle);
    }

    #[test]
    fn aggregate_priority_is_blocked_then_working_then_idle() {
        let mut cache = AgentCache::default();
        cache.replace(vec![
            agent("p1", AgentState::Idle),
            agent("p2", AgentState::Working),
        ]);
        assert_eq!(cache.aggregate(true), AggregateState::Working);
        cache.update(agent("p1", AgentState::Blocked));
        assert_eq!(cache.aggregate(true), AggregateState::NeedsAttention);
        assert_eq!(cache.aggregate(false), AggregateState::Offline);
    }

    #[test]
    fn ignores_same_state_presentation_updates() {
        let mut cache = AgentCache::default();
        cache.replace(vec![agent("p1", AgentState::Working)]);
        let mut updated = agent("p1", AgentState::Working);
        updated.title = Some("new title".into());
        assert_eq!(cache.update(updated), None);
    }

    #[test]
    fn maps_future_herdr_states_to_unknown() {
        let state: AgentState = serde_json::from_str("\"waiting_for_tool\"").unwrap();
        assert_eq!(state, AgentState::Unknown);
    }

    #[test]
    fn quiet_aggregation_keeps_protective_states_but_hides_working() {
        let mut cache = AgentCache::default();
        cache.replace(vec![agent("p1", AgentState::Working)]);
        assert_eq!(cache.aggregate_quiet(true), AggregateState::Idle);
        cache.update(agent("p1", AgentState::Blocked));
        assert_eq!(cache.aggregate_quiet(true), AggregateState::NeedsAttention);
        assert_eq!(cache.aggregate_quiet(false), AggregateState::Offline);
    }

    #[test]
    fn status_updates_keep_the_workspace_display_label() {
        let mut cache = AgentCache::default();
        cache.update(agent("p1", AgentState::Idle));
        let mut update = agent("p1", AgentState::Working);
        update.workspace_label = None;
        cache.update(update);
        assert_eq!(
            cache.list()[0].workspace_label.as_deref(),
            Some("host: project")
        );
    }
}
