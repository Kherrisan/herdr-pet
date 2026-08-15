import { describe, expect, it } from "vitest";
import { soundEnabled } from "./sound";

const audio = {
  enabled: true,
  volume: 0.35,
  agentDetected: false,
  turnCompleted: true,
  attentionRequested: true,
  agentStarted: false,
  agentExited: false,
  reconnected: false,
};

describe("intent sound rules", () => {
  it("supports per-event switches and keeps unrelated events silent", () => {
    expect(soundEnabled("turn_completed", audio)).toBe(true);
    expect(soundEnabled("attention_requested", audio)).toBe(true);
    expect(soundEnabled("agent_started", audio)).toBe(false);
    expect(soundEnabled("reconnected", audio)).toBe(false);
  });

  it("honors the global mute switch", () => {
    expect(soundEnabled("turn_completed", { ...audio, enabled: false })).toBe(false);
  });
});
