import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import type { AgentInfo } from "../shared/types";
import { api } from "../shared/tauri";
import "../styles/overlay.css";

export function AgentBubbleApp() {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [expanded, setExpanded] = useState(false);
  const workingAgents = agents.filter((agent) => agent.state === "working");

  useEffect(() => {
    const unlisten = listen<AgentInfo[]>("herdr://agents-changed", ({ payload }) => {
      setAgents(payload);
    });
    void api.listAgents().then(setAgents);
    return () => void unlisten.then((dispose) => dispose());
  }, []);

  useEffect(() => {
    if (!workingAgents.length) setExpanded(false);
    void api.setAgentBubbleLayout(workingAgents.length, expanded);
  }, [expanded, workingAgents.length]);

  if (!workingAgents.length) return null;

  async function toggleExpanded() {
    const next = !expanded;
    await api.setAgentBubbleLayout(workingAgents.length, next);
    setExpanded(next);
  }

  return (
    <main className={`agent-bubble-stage${expanded ? " is-expanded" : ""}`}>
      <button
        className="agent-bubble agent-bubble-summary"
        type="button"
        aria-expanded={expanded}
        aria-label={expanded ? "Collapse running agents" : "Show running agents"}
        title={`${workingAgents.length} ${workingAgents.length === 1 ? "agent" : "agents"} working`}
        onClick={() => void toggleExpanded()}
      >
        <span className="agent-bubble-dot" />
        <span>{workingAgents.length}</span>
        <span className="agent-bubble-chevron" aria-hidden="true" />
      </button>
    </main>
  );
}

export function AgentBubbleListApp() {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [expanded, setExpanded] = useState(false);
  const workingAgents = agents.filter((agent) => agent.state === "working");

  useEffect(() => {
    const listeners = Promise.all([
      listen<AgentInfo[]>("herdr://agents-changed", ({ payload }) => setAgents(payload)),
      listen<boolean>("agent-bubbles://expanded", ({ payload }) => setExpanded(payload)),
    ]);
    void api.listAgents().then(setAgents);
    return () => void listeners.then((dispose) => dispose.forEach((item) => item()));
  }, []);

  if (!expanded || !workingAgents.length) return null;

  return (
    <main className="agent-bubble-list-stage is-expanded">
      {workingAgents.map((agent, index) => {
        const workspaceLabel = agent.workspaceLabel || agent.title || agent.workspaceId;
        const agentLabel = agent.agent || agent.paneId;
        return (
          <div
            className="agent-bubble agent-bubble-item"
            key={`${agent.sessionId}:${agent.paneId}`}
            title={`${workspaceLabel} · ${agentLabel}`}
            style={{ "--bubble-index": Math.min(index, 6) } as React.CSSProperties}
          >
            <span className="agent-bubble-dot" />
            <span className="agent-bubble-copy">
              <span className="agent-bubble-workspace">{workspaceLabel}</span>
              <span className="agent-bubble-agent">{agentLabel}</span>
            </span>
          </div>
        );
      })}
    </main>
  );
}
