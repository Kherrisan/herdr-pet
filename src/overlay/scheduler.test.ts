import { describe, expect, it } from "vitest";
import type { PetIntent } from "../shared/types";
import { AnimationScheduler } from "./scheduler";

function intent(id: number, kind: PetIntent["kind"], priority: number, agent = `A${id}`): PetIntent {
  return {
    id,
    kind,
    priority,
    animation: kind === "attention_requested" ? "surprised" : "celebrate",
    durationMs: 2_000,
    count: 1,
    agentNames: [agent],
    workspaceIds: ["w1"],
  };
}

describe("AnimationScheduler", () => {
  it("merges completions in one second without restarting the batch", () => {
    const scheduler = new AnimationScheduler();
    scheduler.setAggregate("working", 0);
    scheduler.enqueue(intent(1, "turn_completed", 70, "A"), 100);
    const snapshot = scheduler.enqueue(intent(2, "turn_completed_background", 70, "B"), 900);

    expect(snapshot.active?.receivedAt).toBe(100);
    expect(snapshot.active?.intent.count).toBe(2);
    expect(snapshot.active?.intent.bubble).toBe("2 个 Agent（A、B） 完成了工作");
    expect(snapshot.queue).toHaveLength(0);
  });

  it("interrupts celebrate for attention and resumes current aggregate afterward", () => {
    const scheduler = new AnimationScheduler();
    scheduler.setAggregate("working", 0);
    scheduler.enqueue(intent(1, "turn_completed", 70), 100);
    let snapshot = scheduler.setAggregate("needs_attention", 200);
    expect(snapshot.active).toBeUndefined();
    expect(snapshot.queue).toHaveLength(1);

    snapshot = scheduler.setAggregate("idle", 300);
    expect(snapshot.active?.intent.kind).toBe("turn_completed");
    expect(snapshot.active?.startedAt).toBe(300);
    snapshot = scheduler.finishActive(500);
    expect(snapshot.active).toBeUndefined();
    expect(snapshot.aggregate).toBe("idle");
  });

  it("does not let completion preempt an attention intent", () => {
    const scheduler = new AnimationScheduler();
    scheduler.setAggregate("needs_attention", 0);
    scheduler.enqueue(intent(1, "attention_requested", 100), 10);
    const snapshot = scheduler.enqueue(intent(2, "turn_completed", 70), 20);
    expect(snapshot.active?.intent.kind).toBe("attention_requested");
    expect(snapshot.queue[0]?.intent.kind).toBe("turn_completed");
  });

  it("clears ordinary events when offline", () => {
    const scheduler = new AnimationScheduler();
    scheduler.setAggregate("working", 0);
    scheduler.enqueue(intent(1, "turn_completed", 70), 10);
    const snapshot = scheduler.setAggregate("offline", 20);
    expect(snapshot.active).toBeUndefined();
    expect(snapshot.queue).toHaveLength(0);
  });

  it("allows only reconnect feedback while offline", () => {
    const scheduler = new AnimationScheduler();
    scheduler.setAggregate("offline", 0);
    expect(scheduler.enqueue(intent(1, "agent_started", 50), 10).active).toBeUndefined();
    const snapshot = scheduler.enqueue(intent(2, "reconnected", 40), 20);
    expect(snapshot.active?.intent.kind).toBe("reconnected");
  });

  it("bounds the queue and retains higher priority events", () => {
    const scheduler = new AnimationScheduler({ maxQueue: 2 });
    scheduler.setAggregate("working", 0);
    scheduler.enqueue(intent(1, "agent_started", 50), 10);
    scheduler.enqueue(intent(2, "agent_started", 50), 20);
    scheduler.enqueue(intent(3, "agent_started", 50), 30);
    const snapshot = scheduler.enqueue(intent(4, "turn_completed", 70), 40);
    expect(snapshot.active?.intent.id).toBe(4);
    expect(snapshot.queue).toHaveLength(2);
    expect(snapshot.queue.map((item) => item.intent.id)).toContain(3);
  });

  it("drops expired delayed events", () => {
    const scheduler = new AnimationScheduler({ eventTtlMs: 100 });
    scheduler.setAggregate("needs_attention", 0);
    scheduler.enqueue(intent(1, "turn_completed", 70), 10);
    const snapshot = scheduler.setAggregate("idle", 200);
    expect(snapshot.active).toBeUndefined();
  });

  it("keeps a ten-agent completion burst bounded and merges one-second batches", () => {
    const scheduler = new AnimationScheduler({ maxQueue: 8, completionMergeMs: 1_000 });
    scheduler.setAggregate("working", 0);
    let snapshot = scheduler.snapshot();
    for (let index = 0; index < 10; index += 1) {
      snapshot = scheduler.enqueue(
        intent(index + 1, "turn_completed", 70, `Agent ${index + 1}`),
        100 + index * 80,
      );
    }

    expect(snapshot.active?.intent.count).toBe(10);
    expect(snapshot.active?.intent.bubble).toContain("等 10 个 Agent");
    expect(snapshot.queue.length).toBeLessThanOrEqual(8);
  });
});
