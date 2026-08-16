import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import type { AgentInfo } from "../shared/types";
import { api } from "../shared/tauri";
import "../styles/overlay.css";

const COMPLETED_BUBBLE_DURATION_MS = 4_000;

type VisibleAgent = AgentInfo & { recentlyCompleted: boolean };

function agentKey(agent: AgentInfo) {
  return `${agent.sessionId}:${agent.paneId}`;
}

function useVisibleAgents(): VisibleAgent[] {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [completed, setCompleted] = useState<Set<string>>(() => new Set());
  const previousStates = useRef(new Map<string, AgentInfo["state"]>());
  const completionTimers = useRef(new Map<string, number>());

  useEffect(() => {
    function updateAgents(next: AgentInfo[]) {
      for (const agent of next) {
        const key = agentKey(agent);
        const previous = previousStates.current.get(key);
        if (previous === "working" && (agent.state === "done" || agent.state === "idle")) {
          const existing = completionTimers.current.get(key);
          if (existing) window.clearTimeout(existing);
          setCompleted((current) => new Set(current).add(key));
          completionTimers.current.set(key, window.setTimeout(() => {
            setCompleted((current) => {
              const updated = new Set(current);
              updated.delete(key);
              return updated;
            });
            completionTimers.current.delete(key);
          }, COMPLETED_BUBBLE_DURATION_MS));
        }
      }
      previousStates.current = new Map(next.map((agent) => [agentKey(agent), agent.state]));
      setAgents(next);
    }

    const unlisten = listen<AgentInfo[]>("herdr://agents-changed", ({ payload }) => updateAgents(payload));
    void api.listAgents().then(updateAgents);
    return () => {
      void unlisten.then((dispose) => dispose());
      completionTimers.current.forEach((timer) => window.clearTimeout(timer));
      completionTimers.current.clear();
    };
  }, []);

  return agents
    .filter((agent) => agent.state === "working" || completed.has(agentKey(agent)))
    .map((agent) => ({ ...agent, recentlyCompleted: completed.has(agentKey(agent)) }));
}

export function AgentBubbleApp() {
  const [expanded, setExpanded] = useState(false);
  const visibleAgents = useVisibleAgents();
  const workingCount = visibleAgents.filter((agent) => !agent.recentlyCompleted).length;

  useEffect(() => {
    if (!visibleAgents.length) setExpanded(false);
    void api.setAgentBubbleLayout(visibleAgents.length, expanded);
  }, [expanded, visibleAgents.length]);

  if (!visibleAgents.length) return null;

  async function toggleExpanded() {
    const next = !expanded;
    await api.setAgentBubbleLayout(visibleAgents.length, next);
    setExpanded(next);
  }

  return (
    <main className={`agent-bubble-stage${expanded ? " is-expanded" : ""}`}>
      <button
        className="agent-bubble agent-bubble-summary"
        type="button"
        aria-expanded={expanded}
        aria-label={expanded ? "Collapse running agents" : "Show running agents"}
        title={`${workingCount} working · ${visibleAgents.length - workingCount} recently completed`}
        onClick={() => void toggleExpanded()}
      >
        <span className={`agent-bubble-dot${workingCount ? "" : " is-completed"}`} />
        <span>{visibleAgents.length}</span>
        <span className="agent-bubble-chevron" aria-hidden="true" />
      </button>
    </main>
  );
}

export function AgentBubbleListApp() {
  const [expanded, setExpanded] = useState(false);
  const visibleAgents = useVisibleAgents();

  useEffect(() => {
    const listeners = Promise.all([
      listen<boolean>("agent-bubbles://expanded", ({ payload }) => setExpanded(payload)),
    ]);
    return () => void listeners.then((dispose) => dispose.forEach((item) => item()));
  }, []);

  if (!expanded || !visibleAgents.length) return null;

  return (
    <main className="agent-bubble-list-stage is-expanded">
      {visibleAgents.map((agent, index) => {
        const workspaceLabel = agent.workspaceLabel || agent.title || agent.workspaceId;
        const agentLabel = agent.agent || agent.paneId;
        return (
          <div
            className="agent-bubble agent-bubble-item"
            key={`${agent.sessionId}:${agent.paneId}`}
            title={`${workspaceLabel} · ${agentLabel}`}
            style={{ "--bubble-index": Math.min(index, 6) } as React.CSSProperties}
          >
            <span className={`agent-bubble-dot${agent.recentlyCompleted ? " is-completed" : ""}`} />
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
