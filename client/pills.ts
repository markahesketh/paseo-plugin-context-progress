import type {
  PluginButton,
  PluginButtonRegistration,
  PluginClientContext,
} from "@getpaseo/plugin/client";
import {
  contextUsageStore,
  formatTokenCount,
  parseContextUsage,
  type ContextUsage,
} from "./progress.ts";

type Agent = Awaited<
  ReturnType<PluginClientContext["paseo"]["agents"]["list"]>
>["entries"][number]["agent"];

type Pill = {
  workspaceId: string;
  title: string;
  registration: PluginButtonRegistration;
};

// The pill is meant to look like a bare ring. Hosts that reject an
// effectively empty label are handled by retrying without one.
const HIDDEN_PILL_LABEL = "\u200B";
const RETRY_BASE_MS = 1_000;
const RETRY_MAX_MS = 30_000;

function describeUsage(usage: ContextUsage | null): string {
  return usage
    ? `Context usage: ${formatTokenCount(usage.usedTokens)} of ${formatTokenCount(usage.limitTokens)} tokens`
    : "Context usage: none reported yet";
}

export function observeContextPills(
  client: PluginClientContext,
  button: Pick<PluginButton, "icon" | "behavior">,
): () => void {
  const pills = new Map<string, Pill>();
  const lifetime = new AbortController();
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let failures = 0;

  function removePill(agentId: string): void {
    pills.get(agentId)?.registration.remove();
    pills.delete(agentId);
    contextUsageStore.set(agentId, null);
  }

  function removeAllPills(): void {
    for (const agentId of [...pills.keys()]) {
      removePill(agentId);
    }
  }

  function addPill(agentId: string, workspaceId: string, title: string) {
    let lastError: unknown;
    for (const label of [{ label: HIDDEN_PILL_LABEL }, {}]) {
      try {
        return client.addComposerPill({
          id: "context-progress",
          workspaceId,
          agentId,
          button: { ...button, title, ...label },
        });
      } catch (error) {
        lastError = error;
      }
    }
    console.error(`Context progress could not add a pill for agent ${agentId}`, lastError);
    return null;
  }

  function syncAgent(agent: Agent): void {
    const { workspaceId } = agent;
    if (!workspaceId || agent.archivedAt) {
      removePill(agent.id);
      return;
    }

    const usage = parseContextUsage(agent.lastUsage);
    const title = describeUsage(usage);
    const existing = pills.get(agent.id);

    if (existing?.workspaceId !== workspaceId) {
      removePill(agent.id);
    }
    contextUsageStore.set(agent.id, usage);

    if (existing?.workspaceId === workspaceId) {
      if (existing.title !== title) {
        existing.registration.update({ title });
        existing.title = title;
      }
      return;
    }

    const registration = addPill(agent.id, workspaceId, title);
    if (registration) {
      pills.set(agent.id, { workspaceId, title, registration });
    } else {
      contextUsageStore.set(agent.id, null);
    }
  }

  function observe(): void {
    let failed = false;

    function fail(error: unknown, subscription?: { release(): Promise<void> }): void {
      if (failed || lifetime.signal.aborted) {
        return;
      }
      failed = true;
      console.error("Context progress agent observation failed", error);
      subscription?.release().catch((releaseError) => {
        console.error("Context progress could not release its subscription", releaseError);
      });
      removeAllPills();

      const delay = Math.min(RETRY_BASE_MS * 2 ** failures, RETRY_MAX_MS);
      failures += 1;
      retryTimer = setTimeout(observe, delay);
    }

    client.paseo.agents
      .list({ subscribe: {}, signal: lifetime.signal })
      .then(({ subscription }) => {
        if (lifetime.signal.aborted) {
          void subscription.release();
          return;
        }

        subscription.subscribe({
          snapshot: ({ entries, pageInfo }) => {
            failures = 0;
            const listed = new Set<string>();
            for (const { agent } of entries) {
              listed.add(agent.id);
              syncAgent(agent);
            }
            if (!pageInfo.hasMore) {
              for (const agentId of [...pills.keys()]) {
                if (!listed.has(agentId)) {
                  removePill(agentId);
                }
              }
            }
          },
          update: (message) => {
            if (message.type !== "agent_update") {
              return;
            }
            const update = message.payload;
            if (update.kind === "remove") {
              removePill(update.agentId);
            } else {
              syncAgent(update.agent);
            }
          },
          error: (error) => fail(error, subscription),
        });
      })
      .catch((error) => fail(error));
  }

  observe();

  return () => {
    lifetime.abort();
    clearTimeout(retryTimer);
    removeAllPills();
  };
}
