import type {
  PluginButtonRegistration,
  PluginClientContext,
} from "@getpaseo/plugin/client";
import { ContextProgressIcon, ContextProgressPopover } from "./client/context-progress";
import { contextUsageKey, contextUsageStore } from "./client/progress";

type AgentReference = {
  id: string;
  workspaceId?: string | null;
  lastUsage?: { contextWindowUsedTokens?: number };
  archivedAt?: string | null;
};

const HIDDEN_PILL_LABEL = "\u200B";

export default function contribute(client: PluginClientContext) {
  const pills = new Map<string, { workspaceId: string; registration: PluginButtonRegistration }>();
  const lifetime = new AbortController();
  let stopped = false;

  function removePill(agentId: string): void {
    const existing = pills.get(agentId);
    if (existing) {
      contextUsageStore.clear(contextUsageKey(existing.workspaceId, agentId));
      existing.registration.remove();
    }
    pills.delete(agentId);
  }

  function registerPill(agent: AgentReference): void {
    if (stopped || !agent.workspaceId || agent.archivedAt) {
      removePill(agent.id);
      return;
    }

    contextUsageStore.set(
      contextUsageKey(agent.workspaceId, agent.id),
      agent.lastUsage?.contextWindowUsedTokens,
    );

    const existing = pills.get(agent.id);
    if (existing?.workspaceId === agent.workspaceId) {
      return;
    }

    removePill(agent.id);
    const registration = client.addComposerPill({
      id: "context-progress",
      workspaceId: agent.workspaceId,
      agentId: agent.id,
      button: {
        title: "Context usage, 200k limit",
        label: HIDDEN_PILL_LABEL,
        icon: ContextProgressIcon,
        behavior: { kind: "popover", Content: ContextProgressPopover },
      },
    });
    pills.set(agent.id, { workspaceId: agent.workspaceId, registration });
  }

  void client.paseo.agents
    .list({ subscribe: {}, signal: lifetime.signal })
    .then(({ subscription }) => {
      if (stopped) {
        void subscription.release();
        return;
      }

      subscription.subscribe({
        snapshot: ({ entries }) => {
          const currentAgentIds = new Set<string>();
          for (const { agent } of entries) {
            currentAgentIds.add(agent.id);
            registerPill(agent);
          }
          for (const agentId of pills.keys()) {
            if (!currentAgentIds.has(agentId)) {
              removePill(agentId);
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
            registerPill(update.agent);
          }
        },
      });
    })
    .catch((error) => {
      if (!stopped) {
        console.error("Context progress agent observation failed", error);
      }
    });

  return () => {
    stopped = true;
    lifetime.abort();
    for (const agentId of pills.keys()) {
      removePill(agentId);
    }
  };
}
