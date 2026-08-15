import type { AggregateState, PetIntent } from "../shared/types";

export interface ScheduledIntent {
  intent: PetIntent;
  receivedAt: number;
  expiresAt: number;
  startedAt?: number;
}

export interface SchedulerSnapshot {
  aggregate: AggregateState;
  active?: ScheduledIntent;
  queue: readonly ScheduledIntent[];
  revision: number;
}

export interface AnimationSchedulerOptions {
  maxQueue?: number;
  completionMergeMs?: number;
  eventTtlMs?: number;
}

const COMPLETION_KINDS = new Set<PetIntent["kind"]>([
  "turn_completed",
  "turn_completed_background",
]);

function isCompletion(intent: PetIntent): boolean {
  return COMPLETION_KINDS.has(intent.kind);
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function completionAgentLabel(names: readonly string[], count: number): string {
  if (count <= 1) return names[0] ?? "Agent";
  const visible = names.slice(0, 2);
  if (!visible.length) return `${count} 个 Agent`;
  if (count <= 2) return `${count} 个 Agent（${visible.join("、")}）`;
  return `${visible.join("、")} 等 ${count} 个 Agent`;
}

function completionBubble(
  template: string | undefined,
  names: readonly string[],
  workspaces: readonly string[],
  count: number,
): string {
  return (template || "{agent} 完成了工作")
    .replaceAll("{agent}", completionAgentLabel(names, count))
    .replaceAll("{workspace}", workspaces.slice(0, 2).join("、") || "Workspace")
    .replaceAll("{count}", String(count));
}

function mergeCompletion(target: ScheduledIntent, incoming: PetIntent): ScheduledIntent {
  const names = unique([...(target.intent.agentNames ?? []), ...(incoming.agentNames ?? [])]);
  const workspaces = unique([
    ...(target.intent.workspaceIds ?? []),
    ...(incoming.workspaceIds ?? []),
  ]);
  const count = target.intent.count + incoming.count;
  return {
    ...target,
    intent: {
      ...target.intent,
      count,
      agentNames: names,
      workspaceIds: workspaces,
      bubble: completionBubble(target.intent.bubbleTemplate, names, workspaces, count),
    },
  };
}

export class AnimationScheduler {
  private aggregate: AggregateState = "offline";
  private active?: ScheduledIntent;
  private queue: ScheduledIntent[] = [];
  private revision = 0;
  private maxQueue: number;
  private completionMergeMs: number;
  private eventTtlMs: number;

  constructor(options: AnimationSchedulerOptions = {}) {
    this.maxQueue = options.maxQueue ?? 8;
    this.completionMergeMs = options.completionMergeMs ?? 1_000;
    this.eventTtlMs = options.eventTtlMs ?? 15_000;
  }

  configure(options: AnimationSchedulerOptions, now = Date.now()): SchedulerSnapshot {
    this.maxQueue = options.maxQueue ?? this.maxQueue;
    this.completionMergeMs = options.completionMergeMs ?? this.completionMergeMs;
    this.eventTtlMs = options.eventTtlMs ?? this.eventTtlMs;
    this.prune(now);
    this.trimQueue();
    return this.changed();
  }

  snapshot(): SchedulerSnapshot {
    return {
      aggregate: this.aggregate,
      active: this.active,
      queue: [...this.queue],
      revision: this.revision,
    };
  }

  setAggregate(aggregate: AggregateState, now = Date.now()): SchedulerSnapshot {
    this.aggregate = aggregate;
    this.prune(now);

    if (aggregate === "offline") {
      this.active = undefined;
      this.queue = [];
    } else if (
      aggregate === "needs_attention" &&
      this.active &&
      this.active.intent.priority < 100
    ) {
      const interrupted = this.active;
      if (isCompletion(interrupted.intent) && interrupted.expiresAt > now) {
        this.queue.push({ ...interrupted, startedAt: undefined });
        this.trimQueue();
      }
      this.active = undefined;
    } else if (!this.active) {
      this.activateNext(now);
    }

    return this.changed();
  }

  enqueue(intent: PetIntent, now = Date.now()): SchedulerSnapshot {
    this.prune(now);
    if (this.aggregate === "offline" && intent.kind !== "reconnected") return this.snapshot();

    if (isCompletion(intent) && this.mergeIntoCompletion(intent, now)) {
      return this.changed();
    }

    const scheduled: ScheduledIntent = {
      intent,
      receivedAt: now,
      expiresAt: now + this.eventTtlMs,
    };

    const protectedByAggregate =
      this.aggregate === "needs_attention" && intent.priority < 100;
    if (protectedByAggregate) {
      this.queue.push(scheduled);
      this.trimQueue();
      return this.changed();
    }

    if (!this.active) {
      this.active = { ...scheduled, startedAt: now };
    } else if (intent.priority > this.active.intent.priority) {
      if (this.active.expiresAt > now) this.queue.push({ ...this.active, startedAt: undefined });
      this.active = { ...scheduled, startedAt: now };
      this.trimQueue();
    } else {
      this.queue.push(scheduled);
      this.trimQueue();
    }
    return this.changed();
  }

  finishActive(now = Date.now()): SchedulerSnapshot {
    this.active = undefined;
    this.prune(now);
    this.activateNext(now);
    return this.changed();
  }

  private mergeIntoCompletion(intent: PetIntent, now: number): boolean {
    if (
      this.active &&
      isCompletion(this.active.intent) &&
      now - this.active.receivedAt <= this.completionMergeMs
    ) {
      this.active = mergeCompletion(this.active, intent);
      return true;
    }
    const queuedIndex = this.queue.findIndex(
      (item) => isCompletion(item.intent) && now - item.receivedAt <= this.completionMergeMs,
    );
    if (queuedIndex >= 0) {
      this.queue[queuedIndex] = mergeCompletion(this.queue[queuedIndex], intent);
      return true;
    }
    return false;
  }

  private activateNext(now: number): void {
    if (this.aggregate === "offline" || this.aggregate === "needs_attention") return;
    this.prune(now);
    this.queue.sort(
      (left, right) =>
        right.intent.priority - left.intent.priority || left.receivedAt - right.receivedAt,
    );
    const next = this.queue.shift();
    this.active = next ? { ...next, startedAt: now } : undefined;
  }

  private prune(now: number): void {
    this.queue = this.queue.filter((item) => item.expiresAt > now);
    if (this.active && this.active.expiresAt <= now) this.active = undefined;
  }

  private trimQueue(): void {
    if (this.queue.length <= this.maxQueue) return;
    this.queue.sort(
      (left, right) =>
        right.intent.priority - left.intent.priority || right.receivedAt - left.receivedAt,
    );
    this.queue = this.queue.slice(0, this.maxQueue);
  }

  private changed(): SchedulerSnapshot {
    this.revision += 1;
    return this.snapshot();
  }
}
