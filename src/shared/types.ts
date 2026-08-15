export type AgentState = "idle" | "working" | "blocked" | "done" | "unknown";

export type AggregateState =
  | "sleeping"
  | "idle"
  | "working"
  | "needs_attention"
  | "offline";

export type PetIntentKind =
  | "agent_detected"
  | "agent_started"
  | "turn_completed"
  | "turn_completed_background"
  | "attention_requested"
  | "agent_exited"
  | "reconnected";

export interface PetIntent {
  id: number;
  kind: PetIntentKind;
  animation: string;
  priority: number;
  durationMs: number;
  bubble?: string;
  bubbleTemplate?: string;
  count: number;
  agentNames?: string[];
  workspaceIds?: string[];
}

export interface AgentInfo {
  sessionId: string;
  workspaceId: string;
  paneId: string;
  agent?: string;
  title?: string;
  state: AgentState;
}

export interface ConnectionStatus {
  state: "disconnected" | "connecting" | "connected";
  socketPath?: string;
  version?: string;
  protocol?: number;
  agentCount: number;
  lastError?: string;
  retryInMs?: number;
}

export interface EventRuleConfig {
  enabled: boolean;
  animation: string;
  bubble: string;
  durationMs: number;
  cooldownMs: number;
}

export interface AppConfig {
  schemaVersion: number;
  language: "zh-CN" | "en";
  overlay: {
    alwaysOnTop: boolean;
    clickThrough: boolean;
    locked: boolean;
    scale: number;
    opacity: number;
    fps: 30 | 60;
    position: {
      x: number;
      y: number;
      monitorId?: string | null;
      scaleFactor?: number | null;
    } | null;
  };
  herdr: {
    autoDiscover: boolean;
    session: string | null;
    socketPath: string | null;
    wsl: {
      enabled: boolean;
      distribution: string | null;
    };
    observation: {
      mode: "all" | "current_workspace" | "selected" | "quiet";
      currentWorkspaceId: string | null;
      workspaceIds: string[];
      paneIds: string[];
    };
  };
  avatar: {
    installationId: string | null;
    avatarId: string | null;
    animationSpeed: number;
    stateAnimations: {
      sleeping: string;
      idle: string;
      working: string;
      needsAttention: string;
      offline: string;
    };
  };
  events: {
    agentDetected: EventRuleConfig;
    turnCompleted: EventRuleConfig;
    attentionRequested: EventRuleConfig;
    agentStarted: EventRuleConfig;
    agentExited: EventRuleConfig;
    reconnected: EventRuleConfig;
  };
  scheduler: {
    maxQueue: number;
    completionMergeMs: number;
    eventTtlMs: number;
  };
  desktop: {
    autoStart: boolean;
    paused: boolean;
    toggleShortcut: string;
  };
  audio: {
    enabled: boolean;
    volume: number;
    agentDetected: boolean;
    turnCompleted: boolean;
    attentionRequested: boolean;
    agentStarted: boolean;
    agentExited: boolean;
    reconnected: boolean;
  };
}

export interface AvatarProjectAvatarSummary {
  id: string;
  name: string;
  animationKeys: string[];
}

export interface AvatarProjectInspection {
  version: number;
  contentHash: string;
  sizeBytes: number;
  displayName: string;
  avatars: AvatarProjectAvatarSummary[];
  expressionCount: number;
  animationCount: number;
  totalSteps: number;
}

export interface AvatarProjectFileInspection {
  source: string;
  fileName: string;
  inspection: AvatarProjectInspection;
}

export interface AvatarInstallation {
  id: string;
  contentHash: string;
  importedAtMs: number;
  importerVersion: number;
  selectedAvatarId: string;
  summary: AvatarProjectInspection;
}

export interface AvatarProjectSource {
  installation: AvatarInstallation;
  source: string;
}

export interface DiagnosticReport {
  generatedAtMs: number;
  appVersion: string;
  platform: string;
  globalShortcutAvailable: boolean;
  absolutePositionAvailable: boolean;
  connection: {
    state: ConnectionStatus["state"];
    version: string | null;
    protocol: number | null;
    agentCount: number;
    hasError: boolean;
  };
  runtime: {
    startedAtMs: number;
    reconnectCount: number;
    lastEventKind: string | null;
    lastEventAtMs: number | null;
    avatarRuntimeHasError: boolean;
  };
  preferences: {
    observationMode: AppConfig["herdr"]["observation"]["mode"];
    wslMode: boolean;
    customAvatar: boolean;
    fps: 30 | 60;
    animationSpeed: number;
    paused: boolean;
  };
}
