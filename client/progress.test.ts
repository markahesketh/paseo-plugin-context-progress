import {
  CONTEXT_LIMIT,
  createContextUsageStore,
  getContextProgressState,
  WARNING_THRESHOLD,
} from "./progress.ts";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const normal = getContextProgressState(WARNING_THRESHOLD);
assert(normal.level === "normal", "150,000 tokens must remain normal");
assert(normal.progress === 0.75, "150,000 tokens must be 75% of the limit");

const warning = getContextProgressState(WARNING_THRESHOLD + 1);
assert(warning.level === "warning", "Values over 150,000 tokens must be yellow");

const limit = getContextProgressState(CONTEXT_LIMIT);
assert(limit.level === "warning", "Exactly 200,000 tokens must not be red");
assert(limit.progress === 1, "The ring must be full at the limit");

const danger = getContextProgressState(CONTEXT_LIMIT + 1);
assert(danger.level === "danger", "Values over 200,000 tokens must be red");
assert(danger.progress === 1, "The ring must stay full over the limit");

const missing = getContextProgressState(undefined);
assert(missing.usedTokens === 0 && missing.progress === 0, "Missing usage must show an empty ring");

const store = createContextUsageStore();
const key = "workspace-1:agent-1";
let notifications = 0;
const unsubscribe = store.subscribe(key, () => {
  notifications += 1;
});

store.set(key, 200_001);
assert(store.get(key) === 200_001, "The store must publish the latest usage snapshot");
assert(notifications === 1, "A new usage snapshot must notify subscribers");

store.set(key, 200_001);
assert(notifications === 1, "An unchanged usage snapshot must not notify subscribers");

store.set(key, 58_048);
assert(store.get(key) === 58_048, "A later snapshot must replace an earlier usage value");
assert(notifications === 2, "A changed usage snapshot must notify subscribers");

unsubscribe();
store.clear(key);
assert(store.get(key) === null, "Clearing an agent must remove its usage snapshot");
