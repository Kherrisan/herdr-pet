import { describe, expect, it } from "vitest";
import type { AggregateState } from "../shared/types";
import {
  persistentPriority,
  animationForAggregate,
  frameRateForState,
  normalizeAvatarMappings,
  changedAvatarMappings,
  resolveAvatarLabAnimation,
  shouldReplaceTransient,
  TRANSIENT_ANIMATIONS,
} from "./animation";

describe("overlay animation mapping", () => {
  it("keeps visible persistent animation smooth and throttles only sleeping", () => {
    expect(frameRateForState("sleeping", 60, false)).toBe(5);
    expect(frameRateForState("idle", 30, false)).toBe(30);
    expect(frameRateForState("idle", 60, false)).toBe(60);
    expect(frameRateForState("offline", 60, false)).toBe(60);
    expect(frameRateForState("working", 30, false)).toBe(30);
    expect(frameRateForState("needs_attention", 60, false)).toBe(60);
    expect(frameRateForState("idle", 60, true)).toBe(60);
  });

  it("maps both foreground and background completion to celebration", () => {
    expect(TRANSIENT_ANIMATIONS.turn_completed).toBe("celebrate");
    expect(TRANSIENT_ANIMATIONS.turn_completed_background).toBe("celebrate");
  });

  it("keeps aggregate states representable as continuous animations", () => {
    const states: AggregateState[] = ["sleeping", "idle", "working", "needs_attention", "offline"];
    expect(new Set(states).size).toBe(5);
  });

  it("maps Herdr states and transient intents to official Avatar Lab animations", () => {
    expect(resolveAvatarLabAnimation("working")).toBe("working");
    expect(resolveAvatarLabAnimation("needs_attention")).toBe("surprised");
    expect(resolveAvatarLabAnimation("offline")).toBe("sad");
    expect(resolveAvatarLabAnimation("celebrate")).toBe("celebrate");
    expect(resolveAvatarLabAnimation("custom-animation")).toBe("custom-animation");
  });

  it("uses configured animations for persistent aggregate states", () => {
    const avatar = {
      installationId: null,
      avatarId: null,
      animationSpeed: 1,
      stateAnimations: {
        sleeping: "drowsy",
        idle: "happy",
        working: "thinking",
        needsAttention: "scared",
        offline: "sad",
      },
    };
    expect(animationForAggregate("working", avatar)).toBe("thinking");
    expect(animationForAggregate("needs_attention", avatar)).toBe("scared");
  });

  it("preserves valid custom mappings and repairs missing mappings", () => {
    const config = {
      schemaVersion: 4,
      language: "zh-CN" as const,
      overlay: {
        alwaysOnTop: true,
        clickThrough: false,
        locked: false,
        scale: 1,
        opacity: 1,
        fps: 60 as const,
        position: null,
      },
      herdr: {
        autoDiscover: true,
        session: null,
        socketPath: null,
        wsl: { enabled: false, distribution: null },
        observation: {
          mode: "all" as const,
          currentWorkspaceId: null,
          workspaceIds: [],
          paneIds: [],
        },
      },
      avatar: {
        installationId: null,
        avatarId: null,
        animationSpeed: 1,
        stateAnimations: {
          sleeping: "missing",
          idle: "happy",
          working: "missing",
          needsAttention: "missing",
          offline: "missing",
        },
      },
      events: {
        agentDetected: {
          enabled: true,
          animation: "missing",
          bubble: "",
          durationMs: 1000,
          cooldownMs: 1000,
        },
        turnCompleted: {
          enabled: true,
          animation: "missing",
          bubble: "",
          durationMs: 1000,
          cooldownMs: 1000,
        },
        attentionRequested: {
          enabled: true,
          animation: "missing",
          bubble: "",
          durationMs: 1000,
          cooldownMs: 1000,
        },
        agentStarted: {
          enabled: true,
          animation: "missing",
          bubble: "",
          durationMs: 1000,
          cooldownMs: 1000,
        },
        agentExited: {
          enabled: true,
          animation: "missing",
          bubble: "",
          durationMs: 1000,
          cooldownMs: 1000,
        },
        reconnected: {
          enabled: true,
          animation: "missing",
          bubble: "",
          durationMs: 1000,
          cooldownMs: 1000,
        },
      },
      scheduler: { maxQueue: 8, completionMergeMs: 1000, eventTtlMs: 15000 },
      desktop: {
        autoStart: false,
        paused: false,
        toggleShortcut: "CmdOrCtrl+Shift+H",
      },
      audio: {
        enabled: false,
        volume: 0.35,
        agentDetected: false,
        turnCompleted: true,
        attentionRequested: true,
        agentStarted: false,
        agentExited: false,
        reconnected: false,
      },
    };
    const repaired = normalizeAvatarMappings(config, [
      "idle",
      "happy",
      "working",
      "surprised",
      "sad",
      "celebrate",
      "excited",
    ]);
    expect(repaired.avatar.stateAnimations.idle).toBe("happy");
    expect(repaired.avatar.stateAnimations.working).toBe("working");
    expect(repaired.events.turnCompleted.animation).toBe("celebrate");
    expect(changedAvatarMappings(config, repaired)).toContain("工作中：missing → working");
  });

  it("lets blocked and offline states preempt lower-priority animations", () => {
    expect(persistentPriority("needs_attention")).toBeGreaterThan(70);
    expect(persistentPriority("offline")).toBeGreaterThan(100);
  });

  it("does not let a start animation replace a completion animation", () => {
    expect(shouldReplaceTransient(70, 50)).toBe(false);
    expect(shouldReplaceTransient(70, 100)).toBe(true);
  });
});
