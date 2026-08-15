import { describe, expect, it } from "vitest";
import {
  AVATAR_LAB_ANIMATION_ALIASES,
  resolveAvatarLabAnimation,
} from "../overlay/animation";
import {
  AVATAR_DATA_VERSION,
  AVATAR_LAB_REVISION,
  AVATAR_STUDIO_PROJECT_VERSION,
  officialAvatarAnimations,
  officialAvatarPayload,
} from "./officialRuntime";
import { generateJavaScriptAvatarModule } from "../../third-party/avatar-lab/src/features/export/exporter";

describe("official Avatar Lab integration", () => {
  it("builds the official Strobi Avatar Data v1 payload", () => {
    expect(officialAvatarPayload.version).toBe(AVATAR_DATA_VERSION);
    expect(AVATAR_STUDIO_PROJECT_VERSION).toBe(2);
    expect(AVATAR_LAB_REVISION).toMatch(/^[0-9a-f]{40}$/);
    expect(officialAvatarPayload.avatar.name).toBe("Strobi");
    expect(officialAvatarAnimations).toContain("idle");
    expect(officialAvatarAnimations).toContain("working");
    expect(officialAvatarAnimations).toContain("celebrate");
  });

  it("only maps Herdr intents to animations present in the official payload", () => {
    const available = new Set(officialAvatarAnimations);
    for (const alias of Object.values(AVATAR_LAB_ANIMATION_ALIASES)) {
      expect(available.has(alias), `${alias} should exist`).toBe(true);
    }
    expect(resolveAvatarLabAnimation("custom-animation")).toBe("custom-animation");
  });

  it("includes the local playback-rate, FPS and reduced-motion runtime extension", () => {
    const source = generateJavaScriptAvatarModule(officialAvatarPayload);
    expect(source).toContain("options.animationSpeed");
    expect(source).toContain("options.fps");
    expect(source).toContain("options.reducedMotion");
    expect(source).toContain("1000 / maximumFps");
    expect(source).toContain("setFps(nextFps)");
  });
});
