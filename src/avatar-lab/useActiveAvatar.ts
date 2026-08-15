import { useEffect, useState } from "react";
import { api } from "../shared/tauri";
import type { AppConfig } from "../shared/types";
import { builtInAvatarProject, parseAvatarProject, type ResolvedAvatarProject } from "./project";

export interface ActiveAvatarState {
  project: ResolvedAvatarProject;
  source: "built-in" | "installed";
  loading: boolean;
  error?: string;
}

export function useActiveAvatar(
  avatarConfig: AppConfig["avatar"] | undefined,
): ActiveAvatarState {
  const [state, setState] = useState<ActiveAvatarState>({
    project: builtInAvatarProject,
    source: "built-in",
    loading: false,
  });

  useEffect(() => {
    let cancelled = false;
    if (!avatarConfig?.installationId) {
      setState({ project: builtInAvatarProject, source: "built-in", loading: false });
      return () => {
        cancelled = true;
      };
    }
    setState((current) => ({ ...current, loading: true, error: undefined }));
    void api
      .getAvatarProject(avatarConfig.installationId)
      .then(({ source }) => parseAvatarProject(source, avatarConfig.avatarId))
      .then((project) => {
        if (!cancelled) setState({ project, source: "installed", loading: false });
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setState({
            project: builtInAvatarProject,
            source: "built-in",
            loading: false,
            error: cause instanceof Error ? cause.message : String(cause),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [avatarConfig?.avatarId, avatarConfig?.installationId]);

  return state;
}
