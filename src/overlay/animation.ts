import type { AggregateState, AppConfig, PetIntentKind } from "../shared/types";

export function frameRateForState(
  state: AggregateState,
  configuredFps: 30 | 60,
  transient: boolean,
): number {
  if (!transient && state === "sleeping") return Math.min(5, configuredFps);
  return configuredFps;
}

export const TRANSIENT_ANIMATIONS: Record<PetIntentKind, string> = {
  agent_detected: "greeting",
  agent_started: "start-working",
  turn_completed: "celebrate",
  turn_completed_background: "celebrate",
  attention_requested: "ask-for-help",
  agent_exited: "goodbye",
  reconnected: "greeting",
};

export const AVATAR_LAB_ANIMATION_ALIASES: Readonly<Record<string, string>> = {
  sleeping: "sleeping",
  idle: "idle",
  working: "working",
  needs_attention: "surprised",
  offline: "sad",
  greeting: "waking",
  "start-working": "excited",
  celebrate: "celebrate",
  "ask-for-help": "surprised",
  goodbye: "drowsy",
};

export function resolveAvatarLabAnimation(animation: string): string {
  return AVATAR_LAB_ANIMATION_ALIASES[animation] ?? animation;
}

export function animationForAggregate(
  state: AggregateState,
  avatar: AppConfig["avatar"] | undefined,
): string {
  if (!avatar) return resolveAvatarLabAnimation(state);
  if (state === "needs_attention") return avatar.stateAnimations.needsAttention;
  return avatar.stateAnimations[state];
}

function availableAnimation(
  current: string,
  preferred: string,
  available: ReadonlySet<string>,
  fallback: string,
): string {
  if (available.has(current)) return current;
  if (available.has(preferred)) return preferred;
  if (available.has("idle")) return "idle";
  return fallback;
}

export function normalizeAvatarMappings(
  config: AppConfig,
  animationKeys: readonly string[],
): AppConfig {
  if (!animationKeys.length) return config;
  const available = new Set(animationKeys);
  const fallback = animationKeys[0];
  const state = config.avatar.stateAnimations;
  return {
    ...config,
    avatar: {
      ...config.avatar,
      stateAnimations: {
        sleeping: availableAnimation(state.sleeping, "sleeping", available, fallback),
        idle: availableAnimation(state.idle, "idle", available, fallback),
        working: availableAnimation(state.working, "working", available, fallback),
        needsAttention: availableAnimation(
          state.needsAttention,
          "surprised",
          available,
          fallback,
        ),
        offline: availableAnimation(state.offline, "sad", available, fallback),
      },
    },
    events: {
      ...config.events,
      agentDetected: {
        ...config.events.agentDetected,
        animation: availableAnimation(
          config.events.agentDetected.animation,
          "waking",
          available,
          fallback,
        ),
      },
      turnCompleted: {
        ...config.events.turnCompleted,
        animation: availableAnimation(
          config.events.turnCompleted.animation,
          "celebrate",
          available,
          fallback,
        ),
      },
      attentionRequested: {
        ...config.events.attentionRequested,
        animation: availableAnimation(
          config.events.attentionRequested.animation,
          "surprised",
          available,
          fallback,
        ),
      },
      agentStarted: {
        ...config.events.agentStarted,
        animation: availableAnimation(
          config.events.agentStarted.animation,
          "excited",
          available,
          fallback,
        ),
      },
      agentExited: {
        ...config.events.agentExited,
        animation: availableAnimation(
          config.events.agentExited.animation,
          "drowsy",
          available,
          fallback,
        ),
      },
      reconnected: {
        ...config.events.reconnected,
        animation: availableAnimation(
          config.events.reconnected.animation,
          "waking",
          available,
          fallback,
        ),
      },
    },
  };
}

export function changedAvatarMappings(before: AppConfig, after: AppConfig): string[] {
  const labels: Array<[string, string, string]> = [
    ["没有 Agent", before.avatar.stateAnimations.sleeping, after.avatar.stateAnimations.sleeping],
    ["空闲", before.avatar.stateAnimations.idle, after.avatar.stateAnimations.idle],
    ["工作中", before.avatar.stateAnimations.working, after.avatar.stateAnimations.working],
    ["需要关注", before.avatar.stateAnimations.needsAttention, after.avatar.stateAnimations.needsAttention],
    ["离线", before.avatar.stateAnimations.offline, after.avatar.stateAnimations.offline],
    ["Turn 完成", before.events.turnCompleted.animation, after.events.turnCompleted.animation],
    ["请求关注", before.events.attentionRequested.animation, after.events.attentionRequested.animation],
    ["Agent 开始", before.events.agentStarted.animation, after.events.agentStarted.animation],
    ["Agent 检出", before.events.agentDetected.animation, after.events.agentDetected.animation],
    ["Agent 退出", before.events.agentExited.animation, after.events.agentExited.animation],
    ["Herdr 重连", before.events.reconnected.animation, after.events.reconnected.animation],
  ];
  return labels
    .filter(([, previous, next]) => previous !== next)
    .map(([label, previous, next]) => `${label}：${previous} → ${next}`);
}

export function persistentPriority(state: AggregateState): number {
  if (state === "offline") return 120;
  if (state === "needs_attention") return 100;
  return 0;
}

export function shouldReplaceTransient(currentPriority: number, nextPriority: number): boolean {
  return nextPriority >= currentPriority;
}
