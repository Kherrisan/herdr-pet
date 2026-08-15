import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AvatarLabPet } from "../avatar-lab/AvatarLabPet";
import type { PetIntent } from "../shared/types";
import { AnimationScheduler } from "./scheduler";

const runtime = vi.hoisted(() => {
  const controller = {
    animation: "idle",
    playing: true,
    setFps: vi.fn(),
    play: vi.fn(),
    pause: vi.fn(),
    stop: vi.fn(),
    destroy: vi.fn(),
  };
  return {
    controller,
    createAvatar: vi.fn((target?: HTMLElement, _options?: unknown) => {
      target?.append(document.createElementNS("http://www.w3.org/2000/svg", "svg"));
      return controller;
    }),
  };
});

vi.mock("../avatar-lab/officialRuntime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../avatar-lab/officialRuntime")>();
  return {
    ...actual,
    loadOfficialAvatarRuntime: vi.fn(async () => ({
      availableAnimations: ["idle", "celebrate", "surprised"],
      createAvatar: runtime.createAvatar,
    })),
  };
});

describe("Herdr intent to official runtime integration", () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    runtime.createAvatar.mockClear();
    runtime.controller.play.mockReset();
    runtime.controller.setFps.mockReset();
    runtime.controller.pause.mockReset();
    runtime.controller.stop.mockReset();
    runtime.controller.destroy.mockReset();
    runtime.controller.play.mockReturnValue(runtime.controller);
    runtime.controller.setFps.mockReturnValue(runtime.controller);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  it("plays the scheduler animation when a completion intent arrives", async () => {
    const scheduler = new AnimationScheduler();
    scheduler.setAggregate("idle", 0);
    await act(async () => {
      root.render(<AvatarLabPet state="idle" animation="idle" />);
      await Promise.resolve();
    });
    expect(runtime.createAvatar).toHaveBeenCalledOnce();

    const intent: PetIntent = {
      id: 7,
      kind: "turn_completed",
      animation: "celebrate",
      priority: 70,
      durationMs: 2_000,
      count: 1,
      agentNames: ["Codex"],
      workspaceIds: ["herdr-pet"],
    };
    const snapshot = scheduler.enqueue(intent, 100);
    await act(async () => {
      root.render(
        <AvatarLabPet
          state={snapshot.aggregate}
          animation={snapshot.active?.intent.animation ?? snapshot.aggregate}
          playbackKey={snapshot.active?.receivedAt}
        />,
      );
    });

    expect(runtime.controller.play).toHaveBeenCalledWith("celebrate");
  });

  it("replays the same preview animation when the playback key changes", async () => {
    await act(async () => {
      root.render(<AvatarLabPet state="idle" animation="celebrate" playbackKey={1} />);
      await Promise.resolve();
    });
    runtime.controller.play.mockClear();

    await act(async () => {
      root.render(<AvatarLabPet state="idle" animation="celebrate" playbackKey={2} />);
    });

    expect(runtime.controller.play).toHaveBeenCalledWith("celebrate");
  });

  it("updates FPS without rebuilding the controller during a state transition", async () => {
    await act(async () => {
      root.render(<AvatarLabPet state="idle" animation="idle" fps={8} />);
      await Promise.resolve();
    });
    runtime.controller.destroy.mockClear();
    runtime.controller.setFps.mockClear();

    await act(async () => {
      root.render(
        <AvatarLabPet
          state="working"
          animation="celebrate"
          playbackKey={3}
          fps={30}
        />,
      );
    });

    expect(runtime.createAvatar).toHaveBeenCalledOnce();
    expect(runtime.controller.destroy).not.toHaveBeenCalled();
    expect(runtime.controller.setFps).toHaveBeenCalledWith(30);
    expect(runtime.controller.play).toHaveBeenCalledWith("celebrate");
  });

  it("destroys exactly one controller on unmount", async () => {
    await act(async () => {
      root.render(<AvatarLabPet state="idle" animation="idle" />);
      await Promise.resolve();
    });
    await act(async () => root.unmount());
    expect(runtime.controller.destroy).toHaveBeenCalledOnce();
    root = createRoot(host);
  });

  it("reports that the official runtime created an SVG", async () => {
    const onRuntimeReady = vi.fn();
    await act(async () => {
      root.render(
        <AvatarLabPet state="idle" animation="idle" onRuntimeReady={onRuntimeReady} />,
      );
      await Promise.resolve();
    });
    expect(onRuntimeReady).toHaveBeenCalledWith({
      animation: "idle",
      availableAnimationCount: 3,
      svgElements: 1,
    });
  });

  it("shows a deterministic first frame when an animation changes while paused", async () => {
    await act(async () => {
      root.render(<AvatarLabPet state="idle" animation="idle" paused />);
      await Promise.resolve();
    });
    expect(runtime.createAvatar.mock.calls[0]?.[1]).toMatchObject({ autoplay: false });

    runtime.controller.play.mockClear();
    runtime.controller.pause.mockClear();
    runtime.controller.stop.mockClear();
    await act(async () => {
      root.render(
        <AvatarLabPet state="idle" animation="celebrate" playbackKey={2} paused />,
      );
    });
    expect(runtime.controller.play).toHaveBeenCalledWith("celebrate");
    expect(runtime.controller.pause).not.toHaveBeenCalled();
    expect(runtime.controller.stop).toHaveBeenCalledOnce();
    expect(runtime.controller.play.mock.invocationCallOrder[0]).toBeLessThan(
      runtime.controller.stop.mock.invocationCallOrder[0],
    );
  });
});
