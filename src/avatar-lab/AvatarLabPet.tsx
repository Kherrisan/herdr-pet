import { useEffect, useRef, useState } from "react";
import type { AggregateState } from "../shared/types";
import { resolveAvatarLabAnimation } from "../overlay/animation";
import {
  loadOfficialAvatarRuntime,
  officialAvatarPayload,
  type AvatarExportPayload,
  type OfficialAvatarController,
} from "./officialRuntime";

interface AvatarLabPetProps {
  state: AggregateState;
  animation: string;
  payload?: AvatarExportPayload;
  playbackKey?: string | number;
  onAnimationEnd?: (animation: string) => void;
  animationSpeed?: number;
  fps?: number;
  pauseWhenHidden?: boolean;
  paused?: boolean;
  playback?: "playing" | "paused" | "stopped";
  loop?: boolean;
  onRuntimeError?: (error?: string) => void;
  onRuntimeReady?: (details: {
    animation: string;
    availableAnimationCount: number;
    svgElements: number;
  }) => void;
}

export function AvatarLabPet({
  state,
  animation,
  payload = officialAvatarPayload,
  playbackKey,
  onAnimationEnd,
  animationSpeed = 1,
  fps = 60,
  pauseWhenHidden = true,
  paused = false,
  playback = "playing",
  loop,
  onRuntimeError,
  onRuntimeReady,
}: AvatarLabPetProps) {
  const effectivePlayback = paused ? "paused" : playback;
  const host = useRef<HTMLSpanElement>(null);
  const controller = useRef<OfficialAvatarController | undefined>(undefined);
  const requestedAnimation = resolveAvatarLabAnimation(animation);
  const requestedAnimationRef = useRef(requestedAnimation);
  const onAnimationEndRef = useRef(onAnimationEnd);
  const playbackRef = useRef(effectivePlayback);
  const onRuntimeErrorRef = useRef(onRuntimeError);
  const onRuntimeReadyRef = useRef(onRuntimeReady);
  const [runtimeStatus, setRuntimeStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string>();
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  requestedAnimationRef.current = requestedAnimation;
  onAnimationEndRef.current = onAnimationEnd;
  playbackRef.current = effectivePlayback;
  onRuntimeErrorRef.current = onRuntimeError;
  onRuntimeReadyRef.current = onRuntimeReady;

  useEffect(() => {
    let disposed = false;
    let mountedController: OfficialAvatarController | undefined;
    setRuntimeStatus("loading");
    setError(undefined);

    void loadOfficialAvatarRuntime(payload)
      .then((runtime) => {
        if (disposed || !host.current) return;
        const available = new Set(runtime.availableAnimations);
        const initialAnimation = available.has(requestedAnimationRef.current)
          ? requestedAnimationRef.current
          : available.has("idle")
            ? "idle"
            : runtime.availableAnimations[0];
        if (!initialAnimation) throw new Error("Avatar 没有可播放动画");
        mountedController = runtime.createAvatar(host.current, {
          animation: initialAnimation,
          autoplay: playbackRef.current === "playing",
          loop,
          size: "100%",
          animationSpeed,
          fps,
          reducedMotion,
          onAnimationEnd: (finished) => onAnimationEndRef.current?.(finished),
        });
        controller.current = mountedController;
        if (playbackRef.current === "paused") {
          mountedController.play(initialAnimation);
          mountedController.stop();
        } else if (playbackRef.current === "stopped") mountedController.stop();
        setRuntimeStatus("ready");
        onRuntimeErrorRef.current?.(undefined);
        onRuntimeReadyRef.current?.({
          animation: initialAnimation,
          availableAnimationCount: runtime.availableAnimations.length,
          svgElements: host.current.querySelectorAll("svg").length,
        });
      })
      .catch((cause: unknown) => {
        if (!disposed) {
          setRuntimeStatus("error");
          const message = cause instanceof Error ? cause.message : String(cause);
          setError(message);
          onRuntimeErrorRef.current?.(message);
        }
      });

    return () => {
      disposed = true;
      mountedController?.destroy();
      if (controller.current === mountedController) controller.current = undefined;
    };
  }, [animationSpeed, loop, payload, reducedMotion]);

  useEffect(() => {
    if (!pauseWhenHidden) return;
    const handleVisibility = () => {
      const avatar = controller.current;
      if (!avatar) return;
      if (document.hidden) avatar.pause();
      else if (playbackRef.current === "playing") avatar.play(requestedAnimationRef.current);
      else if (playbackRef.current === "stopped") avatar.stop();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [pauseWhenHidden]);

  useEffect(() => {
    controller.current?.setFps(fps);
  }, [fps, runtimeStatus]);

  useEffect(() => {
    const avatar = controller.current;
    if (!avatar) return;
    if (effectivePlayback === "paused") avatar.pause();
    else if (effectivePlayback === "stopped") avatar.stop();
    else avatar.play(requestedAnimationRef.current);
  }, [effectivePlayback, runtimeStatus]);

  useEffect(() => {
    const avatar = controller.current;
    if (!avatar) return;
    const animationExists = Object.hasOwn(payload.animations, requestedAnimation);
    const next = animationExists
      ? requestedAnimation
      : Object.hasOwn(payload.animations, "idle")
        ? "idle"
        : Object.keys(payload.animations)[0];
    if (next && (avatar.animation !== next || playbackKey !== undefined)) {
      avatar.play(next);
      if (effectivePlayback === "paused") avatar.stop();
      else if (effectivePlayback === "stopped") avatar.stop();
    }
  }, [effectivePlayback, payload, playbackKey, requestedAnimation, runtimeStatus]);

  return (
    <span
      ref={host}
      className="avatar-lab-pet"
      data-state={state}
      data-animation={requestedAnimation}
      data-runtime-status={runtimeStatus}
      aria-busy={runtimeStatus === "loading"}
      role={error ? "img" : undefined}
      aria-label={error ? `Avatar 加载失败：${error}` : undefined}
    >
      {error && <span className="avatar-lab-pet__error">!</span>}
    </span>
  );
}
