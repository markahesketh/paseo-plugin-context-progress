export const CONTEXT_LIMIT = 200_000;
export const WARNING_THRESHOLD = 150_000;

export type ContextProgressLevel = "normal" | "warning" | "danger";

export interface ContextProgressState {
  usedTokens: number;
  progress: number;
  level: ContextProgressLevel;
}

export type ContextUsageListener = () => void;

export interface ContextUsageStore {
  get(key: string): number | null;
  set(key: string, value: number | null | undefined): void;
  clear(key: string): void;
  subscribe(key: string, listener: ContextUsageListener): () => void;
}

function normalizeUsage(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(value, 0) : null;
}

export function createContextUsageStore(): ContextUsageStore {
  const values = new Map<string, number>();
  const listeners = new Map<string, Set<ContextUsageListener>>();

  function notify(key: string): void {
    for (const listener of listeners.get(key) ?? []) {
      listener();
    }
  }

  return {
    get(key) {
      return values.get(key) ?? null;
    },
    set(key, value) {
      const nextValue = normalizeUsage(value);
      const previousValue = values.get(key) ?? null;

      if (previousValue === nextValue) {
        return;
      }

      if (nextValue === null) {
        values.delete(key);
      } else {
        values.set(key, nextValue);
      }
      notify(key);
    },
    clear(key) {
      const previousValue = values.get(key) ?? null;
      if (previousValue === null) {
        return;
      }

      values.delete(key);
      notify(key);
    },
    subscribe(key, listener) {
      let keyListeners = listeners.get(key);
      if (!keyListeners) {
        keyListeners = new Set();
        listeners.set(key, keyListeners);
      }
      keyListeners.add(listener);

      return () => {
        keyListeners?.delete(listener);
        if (keyListeners?.size === 0) {
          listeners.delete(key);
        }
      };
    },
  };
}

export const contextUsageStore = createContextUsageStore();

export function contextUsageKey(workspaceId: string, agentId: string): string {
  return `${workspaceId}:${agentId}`;
}

export function getContextProgressState(value: number | null | undefined): ContextProgressState {
  const usedTokens = typeof value === "number" && Number.isFinite(value) ? Math.max(value, 0) : 0;
  const level: ContextProgressLevel =
    usedTokens > CONTEXT_LIMIT
      ? "danger"
      : usedTokens > WARNING_THRESHOLD
        ? "warning"
        : "normal";

  return {
    usedTokens,
    progress: Math.min(usedTokens / CONTEXT_LIMIT, 1),
    level,
  };
}

export function formatTokenCount(value: number): string {
  return value.toLocaleString("en-GB");
}
