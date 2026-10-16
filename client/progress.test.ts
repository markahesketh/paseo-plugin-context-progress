import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CONTEXT_LIMIT,
  createContextUsageStore,
  formatTokensShort,
  getContextProgress,
  parseContextUsage,
} from "./progress.ts";

const usage = (usedTokens: number, limitTokens = CONTEXT_LIMIT) => ({ usedTokens, limitTokens });

describe("getContextProgress", () => {
  it("is unknown without usage", () => {
    assert.deepEqual(getContextProgress(null), { level: "unknown" });
  });

  it("changes level just past 150k and 200k", () => {
    const levels = [150_000, 150_001, 200_000, 200_001].map(
      (used) => getContextProgress(usage(used)).level,
    );
    assert.deepEqual(levels, ["normal", "warning", "warning", "danger"]);
  });

  it("clamps progress at 1", () => {
    const over = getContextProgress(usage(250_000));
    assert.equal(over.level === "unknown" ? 0 : over.progress, 1);
  });

  it("derives the warning threshold from the limit", () => {
    const progress = getContextProgress(usage(100_000, 128_000));
    assert.deepEqual(progress, {
      level: "warning",
      usedTokens: 100_000,
      limitTokens: 128_000,
      warningTokens: 96_000,
      progress: 0.78125,
    });
  });
});

describe("parseContextUsage", () => {
  it("rejects missing, negative and non-finite used tokens", () => {
    for (const used of [undefined, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.equal(parseContextUsage({ contextWindowUsedTokens: used }), null);
    }
    assert.equal(parseContextUsage(undefined), null);
  });

  it("uses the model window when it is smaller than the cap", () => {
    assert.deepEqual(
      parseContextUsage({ contextWindowUsedTokens: 10, contextWindowMaxTokens: 128_000 }),
      usage(10, 128_000),
    );
  });

  it("caps a larger model window at the limit", () => {
    assert.deepEqual(
      parseContextUsage({ contextWindowUsedTokens: 10, contextWindowMaxTokens: 1_000_000 }),
      usage(10),
    );
  });

  it("falls back to the cap when the window is missing or invalid", () => {
    for (const max of [undefined, 0, -5, Number.NaN]) {
      assert.deepEqual(
        parseContextUsage({ contextWindowUsedTokens: 10, contextWindowMaxTokens: max }),
        usage(10),
      );
    }
  });
});

describe("formatTokensShort", () => {
  it("rounds to whole thousands", () => {
    assert.deepEqual([200_000, 150_000, 128_000, 96_000].map(formatTokensShort), [
      "200k",
      "150k",
      "128k",
      "96k",
    ]);
  });
});

describe("context usage store", () => {
  it("notifies on change and publishes the new value", () => {
    const store = createContextUsageStore();
    let notifications = 0;
    store.subscribe(() => {
      notifications += 1;
    });

    store.set("a", usage(1));
    store.set("a", usage(2));

    assert.deepEqual(store.get("a"), usage(2));
    assert.equal(notifications, 2);
  });

  it("ignores a field-equal value and keeps the stored identity", () => {
    const store = createContextUsageStore();
    const first = usage(1);
    store.set("a", first);
    let notifications = 0;
    store.subscribe(() => {
      notifications += 1;
    });

    store.set("a", usage(1));

    assert.equal(notifications, 0);
    assert.equal(store.get("a"), first);
  });

  it("stops notifying after unsubscribe", () => {
    const store = createContextUsageStore();
    let notifications = 0;
    const unsubscribe = store.subscribe(() => {
      notifications += 1;
    });

    unsubscribe();
    store.set("a", usage(1));

    assert.equal(notifications, 0);
  });

  it("removes an agent when set to null, notifying once", () => {
    const store = createContextUsageStore();
    store.set("a", usage(1));
    let notifications = 0;
    store.subscribe(() => {
      notifications += 1;
    });

    store.set("a", null);
    store.set("a", null);

    assert.equal(store.get("a"), null);
    assert.equal(notifications, 1);
  });
});
