import type { AppConfig, PetIntentKind } from "../shared/types";

export function soundEnabled(kind: PetIntentKind, audio: AppConfig["audio"]): boolean {
  if (!audio.enabled) return false;
  if (kind === "turn_completed" || kind === "turn_completed_background") {
    return audio.turnCompleted;
  }
  if (kind === "attention_requested") return audio.attentionRequested;
  if (kind === "agent_started") return audio.agentStarted;
  if (kind === "agent_detected") return audio.agentDetected;
  if (kind === "agent_exited") return audio.agentExited;
  if (kind === "reconnected") return audio.reconnected;
  return false;
}

export function playIntentSound(kind: PetIntentKind, audio: AppConfig["audio"]): void {
  if (!soundEnabled(kind, audio)) return;
  const AudioContextClass = window.AudioContext;
  if (!AudioContextClass) return;
  const context = new AudioContextClass();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const attention = kind === "attention_requested";
  oscillator.type = attention ? "triangle" : "sine";
  oscillator.frequency.setValueAtTime(attention ? 520 : 660, context.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(
    attention ? 390 : 880,
    context.currentTime + 0.16,
  );
  gain.gain.setValueAtTime(Math.max(0.0001, audio.volume * 0.12), context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.22);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.22);
  oscillator.addEventListener("ended", () => void context.close(), { once: true });
}
