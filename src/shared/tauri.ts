import { invoke } from "@tauri-apps/api/core";
import type {
  AgentInfo,
  AggregateState,
  AppConfig,
  AvatarInstallation,
  AvatarProjectFileInspection,
  AvatarProjectInspection,
  AvatarProjectSource,
  ConnectionStatus,
  DiagnosticReport,
} from "./types";

export const api = {
  getConfig: () => invoke<AppConfig>("get_app_config"),
  getDefaultConfig: () => invoke<AppConfig>("get_default_app_config"),
  updateConfig: (config: AppConfig) => invoke<AppConfig>("update_app_config", { config }),
  getConnectionStatus: () => invoke<ConnectionStatus>("get_connection_status"),
  listAgents: () => invoke<AgentInfo[]>("list_agents"),
  getAggregateState: () => invoke<AggregateState>("get_aggregate_state"),
  reconnect: () => invoke<void>("reconnect_herdr"),
  reportAvatarRuntimeError: (error: string | null) =>
    invoke<void>("report_avatar_runtime_error", { error }),
  completeRuntimeSelfTest: (result: {
    success: boolean;
    animation: string | null;
    availableAnimationCount: number;
    svgElements: number;
    error: string | null;
  }) => invoke<void>("complete_runtime_self_test", result),
  openSettings: () => invoke<void>("open_settings"),
  resetOverlayPosition: () => invoke<void>("reset_overlay_position"),
  setOverlayBubbleLayout: (workingAgentCount: number, expanded: boolean) =>
    invoke<void>("set_overlay_bubble_layout", { workingAgentCount, expanded }),
  inspectAvatarProject: (source: string) =>
    invoke<AvatarProjectInspection>("inspect_avatar_project", { source }),
  inspectAvatarProjectFile: (path: string) =>
    invoke<AvatarProjectFileInspection>("inspect_avatar_project_file", { path }),
  installAvatarProject: (source: string, avatarId: string) =>
    invoke<AvatarInstallation>("install_avatar_project", { source, avatarId }),
  listAvatarInstallations: () =>
    invoke<AvatarInstallation[]>("list_avatar_installations"),
  getAvatarProject: (installationId: string) =>
    invoke<AvatarProjectSource>("get_avatar_project", { installationId }),
  getActiveAvatarProject: () =>
    invoke<AvatarProjectSource | null>("get_active_avatar_project"),
  selectAvatar: (installationId: string | null, avatarId: string | null) =>
    invoke<AppConfig>("select_avatar", { installationId, avatarId }),
  removeAvatarInstallation: (installationId: string) =>
    invoke<void>("remove_avatar_installation", { installationId }),
  getDiagnostics: () => invoke<DiagnosticReport>("get_diagnostics"),
  exportDiagnostics: () => invoke<string>("export_diagnostics"),
};
