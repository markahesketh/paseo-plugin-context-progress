import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import type { PluginClientContext } from "@getpaseo/plugin/client";
import { observeContextPills } from "./pills.ts";
import { contextUsageStore } from "./progress.ts";

const ZWSP = "\u200B";

type FakeAgent = {
  id: string;
  workspaceId?: string | null;
  archivedAt?: string | null;
  lastUsage?: { contextWindowUsedTokens?: number; contextWindowMaxTokens?: number };
};

type Contribution = {
  workspaceId: string;
  agentId: string;
  button: { title: string; label?: string };
};

type Registration = {
  contribution: Contribution;
  updates: Array<{ title?: string }>;
  removed: boolean;
};

type Observer = {
  snapshot(snapshot: unknown): void;
  update(message: unknown): void;
  error?(error: unknown): void;
};

const agent = (id: string, overrides: Partial<FakeAgent> = {}): FakeAgent => ({
  id,
  workspaceId: "ws-1",
  archivedAt: null,
  lastUsage: { contextWindowUsedTokens: 1_000 },
  ...overrides,
});

function createHarness() {
  const registrations: Registration[] = [];
  const listOptions: Array<{ signal: AbortSignal }> = [];
  const observers: Observer[] = [];
  const listFailures: unknown[] = [];
  let released = 0;
  let rejectPill: (contribution: Contribution) => boolean = () => false;

  const client = {
    addComposerPill(contribution: Contribution) {
      if (rejectPill(contribution)) {
        throw new Error("Plugin button needs label");
      }
      const registration: Registration = { contribution, updates: [], removed: false };
      registrations.push(registration);
      return {
        update: (patch: { title?: string }) => registration.updates.push(patch),
        remove: () => {
          registration.removed = true;
        },
      };
    },
    paseo: {
      agents: {
        async list(options: { signal: AbortSignal }) {
          listOptions.push(options);
          if (listFailures.length > 0) {
            throw listFailures.shift();
          }
          return {
            subscription: {
              subscribe(observer: Observer) {
                observers.push(observer);
                return () => {};
              },
              release() {
                released += 1;
                return Promise.resolve();
              },
            },
          };
        },
      },
    },
  } as unknown as PluginClientContext;

  return {
    client,
    registrations,
    listOptions,
    listFailures,
    get released() {
      return released;
    },
    get observer() {
      const observer = observers.at(-1);
      assert.ok(observer, "list has not resolved a subscription");
      return observer;
    },
    rejectPillsWhere(predicate: (contribution: Contribution) => boolean) {
      rejectPill = predicate;
    },
    live: () => registrations.filter((registration) => !registration.removed),
    snapshot(agents: FakeAgent[], hasMore = false) {
      this.observer.snapshot({ entries: agents.map((a) => ({ agent: a })), pageInfo: { hasMore } });
    },
    upsert(a: FakeAgent) {
      this.observer.update({ type: "agent_update", payload: { kind: "upsert", agent: a } });
    },
    remove(agentId: string) {
      this.observer.update({ type: "agent_update", payload: { kind: "remove", agentId } });
    },
  };
}

const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

async function observe() {
  const harness = createHarness();
  const stop = observeContextPills(harness.client, {
    icon: "circle",
    behavior: { kind: "action", onPress() {} },
  });
  await settle();
  return { harness, stop };
}

describe("observeContextPills", () => {
  beforeEach(() => {
    mock.method(console, "error", () => {});
  });

  afterEach(() => {
    mock.restoreAll();
  });

  it("registers a pill for each agent that has a workspace and is not archived", async () => {
    const { harness, stop } = await observe();

    harness.snapshot([
      agent("a"),
      agent("b", { workspaceId: "ws-2" }),
      agent("no-workspace", { workspaceId: null }),
      agent("archived", { archivedAt: "2026-01-01T00:00:00Z" }),
    ]);

    assert.deepEqual(
      harness.live().map((r) => [r.contribution.agentId, r.contribution.workspaceId]),
      [
        ["a", "ws-1"],
        ["b", "ws-2"],
      ],
    );
    assert.deepEqual(contextUsageStore.get("a"), { usedTokens: 1_000, limitTokens: 200_000 });
    stop();
  });

  it("removes an agent missing from a later snapshot, unless more pages exist", async () => {
    const { harness, stop } = await observe();
    harness.snapshot([agent("a"), agent("b")]);

    harness.snapshot([agent("a")], true);
    assert.deepEqual(
      harness.live().map((r) => r.contribution.agentId),
      ["a", "b"],
    );

    harness.snapshot([agent("a")]);
    assert.deepEqual(
      harness.live().map((r) => r.contribution.agentId),
      ["a"],
    );
    assert.equal(contextUsageStore.get("b"), null);
    stop();
  });

  it("removes the pill and its usage when the agent is removed", async () => {
    const { harness, stop } = await observe();
    harness.snapshot([agent("a")]);

    harness.remove("a");

    assert.equal(harness.live().length, 0);
    assert.equal(contextUsageStore.get("a"), null);
    stop();
  });

  it("re-registers a pill when its agent moves workspace", async () => {
    const { harness, stop } = await observe();
    harness.snapshot([agent("a")]);

    harness.upsert(agent("a", { workspaceId: "ws-2" }));

    assert.deepEqual(
      harness.live().map((r) => r.contribution.workspaceId),
      ["ws-2"],
    );
    stop();
  });

  it("updates the title when usage changes and not when it repeats", async () => {
    const { harness, stop } = await observe();
    harness.snapshot([agent("a", { lastUsage: undefined })]);
    assert.equal(harness.registrations[0]?.contribution.button.title, "Context usage: none reported yet");

    const used = (tokens: number) =>
      agent("a", { lastUsage: { contextWindowUsedTokens: tokens } });
    harness.upsert(used(58_048));
    harness.upsert(used(58_048));

    assert.deepEqual(harness.registrations[0]?.updates, [
      { title: "Context usage: 58,048 of 200,000 tokens" },
    ]);
    stop();
  });

  it("falls back to a label-less pill when the host rejects the hidden label", async () => {
    const { harness, stop } = await observe();
    harness.rejectPillsWhere((c) => c.button.label === ZWSP);

    harness.snapshot([agent("a")]);

    assert.equal(harness.live().length, 1);
    assert.equal("label" in (harness.registrations[0]?.contribution.button ?? {}), false);
    stop();
  });

  it("skips an agent whose pill cannot be added without stopping the others", async () => {
    const { harness, stop } = await observe();
    harness.rejectPillsWhere((c) => c.agentId === "bad");

    harness.snapshot([agent("bad"), agent("good")]);

    assert.deepEqual(
      harness.live().map((r) => r.contribution.agentId),
      ["good"],
    );
    assert.equal(contextUsageStore.get("bad"), null);
    stop();
  });

  it("clears pills and releases the subscription when the observer errors", async () => {
    const { harness, stop } = await observe();
    harness.snapshot([agent("a")]);

    harness.observer.error?.(new Error("connection lost"));

    assert.equal(harness.live().length, 0);
    assert.equal(harness.released, 1);
    stop();
  });

  it("retries a rejected list with doubling backoff", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const harness = createHarness();
    harness.listFailures.push(new Error("offline"), new Error("offline"));
    const stop = observeContextPills(harness.client, {
      icon: "circle",
      behavior: { kind: "action", onPress() {} },
    });
    await settle();
    assert.equal(harness.listOptions.length, 1);

    t.mock.timers.tick(999);
    await settle();
    assert.equal(harness.listOptions.length, 1);

    t.mock.timers.tick(1);
    await settle();
    assert.equal(harness.listOptions.length, 2);

    t.mock.timers.tick(2_000);
    await settle();
    assert.equal(harness.listOptions.length, 3);

    harness.snapshot([agent("a")]);
    assert.equal(harness.live().length, 1);
    stop();
  });

  it("cancels a pending retry on teardown", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const harness = createHarness();
    harness.listFailures.push(new Error("offline"));
    const stop = observeContextPills(harness.client, {
      icon: "circle",
      behavior: { kind: "action", onPress() {} },
    });
    await settle();

    stop();
    t.mock.timers.tick(30_000);
    await settle();

    assert.equal(harness.listOptions.length, 1);
  });

  it("removes every pill and aborts the list signal on teardown", async () => {
    const { harness, stop } = await observe();
    harness.snapshot([agent("a"), agent("b")]);

    stop();

    assert.equal(harness.live().length, 0);
    assert.equal(harness.listOptions[0]?.signal.aborted, true);
    assert.equal(contextUsageStore.get("a"), null);
  });
});
