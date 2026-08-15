import {
  generateJavaScriptAvatarModule,
  type AvatarExportPayload,
} from "../../third-party/avatar-lab/src/features/export/exporter";
import { builtInAvatarProject } from "./project";

export interface OfficialAvatarController {
  readonly animation: string;
  readonly playing: boolean;
  setFps(fps: number): OfficialAvatarController;
  play(animation?: string): OfficialAvatarController;
  pause(): OfficialAvatarController;
  stop(): OfficialAvatarController;
  destroy(): void;
}

export interface OfficialAvatarRuntime {
  readonly availableAnimations: readonly string[];
  createAvatar(
    target: HTMLElement,
    options?: {
      animation?: string;
      autoplay?: boolean;
      loop?: boolean;
      size?: number | string;
      animationSpeed?: number;
      fps?: number;
      reducedMotion?: boolean;
      onAnimationEnd?: (animation: string) => void;
    },
  ): OfficialAvatarController;
}

export const officialAvatarPayload = builtInAvatarProject.payload;

export const officialAvatarAnimations = Object.freeze(
  Object.keys(officialAvatarPayload.animations),
);

export const AVATAR_LAB_REVISION = "8207a2d6aad4b8feefce8cccb10687ce0122724d";
export const AVATAR_STUDIO_PROJECT_VERSION = 2;
export const AVATAR_DATA_VERSION = 1;

const runtimeCache = new WeakMap<AvatarExportPayload, Promise<OfficialAvatarRuntime>>();

export function loadOfficialAvatarRuntime(
  payload: AvatarExportPayload = officialAvatarPayload,
): Promise<OfficialAvatarRuntime> {
  const cached = runtimeCache.get(payload);
  if (cached) return cached;

  const source = generateJavaScriptAvatarModule(payload);
  const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
  const runtime = import(/* @vite-ignore */ url)
    .then((module) => module as OfficialAvatarRuntime)
    .catch((error: unknown) => {
      runtimeCache.delete(payload);
      throw error;
    })
    .finally(() => URL.revokeObjectURL(url));
  runtimeCache.set(payload, runtime);
  return runtime;
}

export type { AvatarExportPayload };
