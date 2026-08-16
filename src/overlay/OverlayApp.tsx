import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { api } from "../shared/tauri";
import type { AgentInfo, AggregateState, AppConfig, PetIntent } from "../shared/types";
import { AvatarLabPet } from "../avatar-lab/AvatarLabPet";
import { useActiveAvatar } from "../avatar-lab/useActiveAvatar";
import {
  animationForAggregate,
  frameRateForState,
  TRANSIENT_ANIMATIONS,
} from "./animation";
import { AnimationScheduler, type SchedulerSnapshot } from "./scheduler";
import { playIntentSound } from "./sound";
import "../styles/overlay.css";

export function OverlayApp() {
  const [aggregate, setAggregate] = useState<AggregateState>("offline");
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [agentsExpanded, setAgentsExpanded] = useState(false);
  const [config, setConfig] = useState<AppConfig>();
  const scheduler = useRef(new AnimationScheduler());
  const lastSoundIntentId = useRef<number | undefined>(undefined);
  const [schedule, setSchedule] = useState<SchedulerSnapshot>(() => scheduler.current.snapshot());
  const activeAvatar = useActiveAvatar(config?.avatar);

  const finishTransient = useCallback(() => {
    if (!scheduler.current.snapshot().active) return;
    setSchedule(scheduler.current.finishActive());
  }, []);

  useEffect(() => {
    const unlisteners = Promise.all([
      listen<AggregateState>("pet://aggregate-state", ({ payload }) => {
        setAggregate(payload);
        setSchedule(scheduler.current.setAggregate(payload));
      }),
      listen<AgentInfo[]>("herdr://agents-changed", ({ payload }) => {
        setAgents(payload);
      }),
      listen<PetIntent>("pet://intent", ({ payload }) => {
        setSchedule(scheduler.current.enqueue(payload));
      }),
      listen<AppConfig>("config://changed", ({ payload }) => {
        setConfig(payload);
        setSchedule(scheduler.current.configure(payload.scheduler));
      }),
    ]);

    void Promise.all([api.getConfig(), api.getAggregateState(), api.listAgents()]).then(
      ([nextConfig, nextAggregate, nextAgents]) => {
        setConfig(nextConfig);
        scheduler.current.configure(nextConfig.scheduler);
        setAggregate(nextAggregate);
        setAgents(nextAgents);
        setSchedule(scheduler.current.setAggregate(nextAggregate));
      },
    );
    return () => {
      void unlisteners.then((items) => items.forEach((unlisten) => unlisten()));
    };
  }, []);

  useEffect(() => {
    const active = schedule.active;
    if (!active) return;
    const speed = config?.avatar.animationSpeed ?? 1;
    const deadline = (active.startedAt ?? active.receivedAt) + active.intent.durationMs / speed;
    const timer = window.setTimeout(finishTransient, Math.max(0, deadline - Date.now()));
    return () => window.clearTimeout(timer);
  }, [config?.avatar.animationSpeed, finishTransient, schedule.active?.startedAt, schedule.active?.receivedAt, schedule.active?.intent.durationMs]);

  useEffect(() => {
    if (
      schedule.active &&
      config &&
      lastSoundIntentId.current !== schedule.active.intent.id
    ) {
      lastSoundIntentId.current = schedule.active.intent.id;
      playIntentSound(schedule.active.intent.kind, config.audio);
    }
  }, [config, schedule.active?.intent.id]);

  const workingAgents = agents.filter((agent) => agent.state === "working");
  useEffect(() => {
    if (!workingAgents.length) setAgentsExpanded(false);
  }, [workingAgents.length]);

  useEffect(() => {
    if (!config) return;
    void api.setOverlayBubbleLayout(workingAgents.length, agentsExpanded);
  }, [agentsExpanded, config?.overlay.scale, workingAgents.length]);

  async function beginDrag(event: React.PointerEvent) {
    if (event.button !== 0 || config?.overlay.locked || config?.overlay.clickThrough) return;
    event.preventDefault();
    await getCurrentWindow().startDragging();
  }

  if (!config) {
    return <main className="pet-stage" aria-busy="true" />;
  }

  const activeIntent = schedule.active?.intent;
  const displayedAnimation = activeIntent
    ? activeIntent.animation || TRANSIENT_ANIMATIONS[activeIntent.kind]
    : animationForAggregate(aggregate, config.avatar);

  return (
    <main
      className="pet-stage"
      onPointerDown={(event) => void beginDrag(event)}
      onDoubleClick={() => void api.openSettings()}
      style={{
        opacity: config.overlay.opacity,
        "--pet-edge": `${Math.round(320 * config.overlay.scale)}px`,
      } as CSSProperties}
    >
      {workingAgents.length > 0 && (
        <div className={`agent-bubbles${agentsExpanded ? " is-expanded" : ""}`}>
          <button
            className="agent-bubble agent-bubble-summary"
            type="button"
            aria-expanded={agentsExpanded}
            aria-label={agentsExpanded ? "Collapse running agents" : "Show running agents"}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => setAgentsExpanded((expanded) => !expanded)}
          >
            <span className="agent-bubble-dot" />
            <span>{workingAgents.length}</span>
            <span className="agent-bubble-chevron">{agentsExpanded ? "⌄" : "⌃"}</span>
          </button>
          {agentsExpanded && (
            <div className="agent-bubble-list" onPointerDown={(event) => event.stopPropagation()}>
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
        </div>
      )}
      <div className="pet-visual">
        {activeIntent?.bubble && <div className="speech-bubble">{activeIntent.bubble}</div>}
        <AvatarLabPet
        state={aggregate}
        animation={displayedAnimation}
        payload={activeAvatar.project.payload}
        playbackKey={schedule.active ? `${schedule.active.receivedAt}:${schedule.active.startedAt}` : undefined}
        onAnimationEnd={finishTransient}
        animationSpeed={config.avatar.animationSpeed}
        fps={frameRateForState(aggregate, config.overlay.fps, Boolean(activeIntent))}
        paused={config.desktop.paused}
        onRuntimeError={(error) => {
          void api.reportAvatarRuntimeError(error ?? null);
          if (error) {
            void api.completeRuntimeSelfTest({
              success: false,
              animation: null,
              availableAnimationCount: 0,
              svgElements: 0,
              error,
            });
          }
        }}
        onRuntimeReady={(details) => {
          void api.completeRuntimeSelfTest({
            success: details.svgElements > 0,
            ...details,
            error: details.svgElements > 0 ? null : "官方运行时没有生成 SVG",
          });
        }}
        />
        {activeAvatar.error && <div className="avatar-runtime-warning">已回退到内置角色</div>}
      </div>
    </main>
  );
}
