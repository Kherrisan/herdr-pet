import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateJavaScriptAvatarModule } from "../../third-party/avatar-lab/src/features/export/exporter";
import { builtInAvatarProject } from "./project";
import type { OfficialAvatarRuntime } from "./officialRuntime";

const VISUAL_STATES = [
  "sleeping",
  "idle",
  "working",
  "surprised",
  "sad",
  "celebrate",
] as const;

const EXPECTED_SVG_HASHES: Record<(typeof VISUAL_STATES)[number], string> = {
  sleeping: "b2abbf26",
  idle: "57dc0f24",
  working: "f7cb6ddd",
  surprised: "6e2a897f",
  sad: "75aae7a1",
  celebrate: "b39d7abd",
};

function evaluateRuntime(): OfficialAvatarRuntime {
  const source = generateJavaScriptAvatarModule(builtInAvatarProject.payload)
    .replace("export const availableAnimations", "const availableAnimations")
    .replace("export function createAvatar", "function createAvatar")
    .replace("export default createAvatar;", "return { availableAnimations, createAvatar };");
  return Function(source)() as OfficialAvatarRuntime;
}

function stableSvgHash(markup: string): string {
  const stable = markup.replaceAll(/avatar-procedural-clip-[^"')]+/g, "avatar-clip");
  let hash = 2_166_136_261;
  for (let index = 0; index < stable.length; index += 1) {
    hash ^= stable.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

describe("built-in Avatar visual regression", () => {
  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  afterEach(() => vi.unstubAllGlobals());

  it("keeps stable SVG geometry for persistent and transient states", () => {
    const runtime = evaluateRuntime();
    const actual = Object.fromEntries(
      VISUAL_STATES.map((animation) => {
        const host = document.createElement("div");
        const controller = runtime.createAvatar(host, { animation, autoplay: false });
        const hash = stableSvgHash(host.innerHTML);
        controller.destroy();
        return [animation, hash];
      }),
    );
    expect(actual).toEqual(EXPECTED_SVG_HASHES);
  });

  it("cancels ambient frames while paused or stopped and resumes them on play", () => {
    const runtime = evaluateRuntime();
    const host = document.createElement("div");
    const controller = runtime.createAvatar(host, { animation: "idle", autoplay: false });
    const requestFrame = vi.mocked(requestAnimationFrame);
    const cancelFrame = vi.mocked(cancelAnimationFrame);
    requestFrame.mockClear();
    cancelFrame.mockClear();

    controller.play("idle");
    expect(requestFrame).toHaveBeenCalled();
    controller.pause();
    expect(cancelFrame).toHaveBeenCalledWith(1);

    requestFrame.mockClear();
    cancelFrame.mockClear();
    controller.play();
    expect(requestFrame).toHaveBeenCalled();
    controller.stop();
    expect(cancelFrame).toHaveBeenCalledWith(1);

    controller.destroy();
  });
});
