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

  return (
    <main className="agent-bubble-stage">
      <button
        className="agent-bubble agent-bubble-summary"
        type="button"
        aria-expanded={expanded}
        aria-label={expanded ? "Collapse running agents" : "Show running agents"}
        title={`${workingAgents.length} ${workingAgents.length === 1 ? "agent" : "agents"} working`}
        onClick={() => setExpanded((value) => !value)}
      >
        <span className="agent-bubble-dot" />
        <span>{workingAgents.length}</span>
        <span className="agent-bubble-chevron">{expanded ? "⌄" : "⌃"}</span>
      </button>
      {expanded && (
        <div className="agent-bubble-list">
          {workingAgents.map((agent) => {
            const label = agent.title || agent.agent || agent.paneId;
            return (
              <div className="agent-bubble agent-bubble-item" key={`${agent.sessionId}:${agent.paneId}`} title={label}>
                <span className="agent-bubble-dot" />
                <span className="agent-bubble-label">{label}</span>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
