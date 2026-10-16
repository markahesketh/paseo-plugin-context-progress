export const CONTEXT_LIMIT = 200_000;
export const WARNING_RATIO = 0.75;

export type ContextUsage = { usedTokens: number; limitTokens: number };

export type ContextProgress =
  | { level: "unknown" }
  | {
      level: "normal" | "warning" | "danger";
      usedTokens: number;
      limitTokens: number;
      warningTokens: number;
      progress: number;
    };

export function parseContextUsage(
  lastUsage:
    | { contextWindowUsedTokens?: number; contextWindowMaxTokens?: number }
    | undefined,
): ContextUsage | null {
  const used = lastUsage?.contextWindowUsedTokens;
  if (typeof used !== "number" || !Number.isFinite(used) || used < 0) {
    return null;
  }

  const max = lastUsage?.contextWindowMaxTokens;
  const hasModelWindow = typeof max === "number" && Number.isFinite(max) && max > 0;
  return { usedTokens: used, limitTokens: hasModelWindow ? Math.min(CONTEXT_LIMIT, max) : CONTEXT_LIMIT };
}

export function getContextProgress(usage: ContextUsage | null): ContextProgress {
  if (!usage) {
    return { level: "unknown" };
  }

  const { usedTokens, limitTokens } = usage;
  const warningTokens = Math.round(limitTokens * WARNING_RATIO);
  const level =
    usedTokens > limitTokens ? "danger" : usedTokens > warningTokens ? "warning" : "normal";

  return {
    level,
    usedTokens,
    limitTokens,
    warningTokens,
    progress: Math.min(usedTokens / limitTokens, 1),
  };
}

export function formatTokenCount(value: number): string {
  return value.toLocaleString("en-GB");
}

export function formatTokensShort(value: number): string {
  return `${Math.round(value / 1000)}k`;
}

export function createContextUsageStore() {
  const usages = new Map<string, ContextUsage>();
  const listeners = new Set<() => void>();

  return {
    get(agentId: string): ContextUsage | null {
      return usages.get(agentId) ?? null;
    },
    set(agentId: string, usage: ContextUsage | null): void {
      const stored = usages.get(agentId);
      if (!usage) {
        if (!stored) {
          return;
        }
        usages.delete(agentId);
      } else if (
        stored?.usedTokens === usage.usedTokens &&
        stored.limitTokens === usage.limitTokens
      ) {
        return;
      } else {
        usages.set(agentId, usage);
      }
      for (const listener of listeners) {
        listener();
      }
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export const contextUsageStore = createContextUsageStore();
