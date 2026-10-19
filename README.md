# Context progress

This Paseo client plugin shows how much of an agent's context window is in use.

The limit is the smaller of 200,000 tokens and the model's own context window, taken from
`agent.lastUsage.contextWindowMaxTokens`. When the model reports no window, the limit is 200,000.

- Normal: Paseo's muted icon colour.
- Above 75% of the limit (150,000 tokens at the default): yellow.
- Above the limit: red.
- No usage reported yet: an empty ring, and the popover says "No usage reported yet".

The value comes from the live `agent.lastUsage.contextWindowUsedTokens` snapshots received by the
plugin's agent subscription. The ring is registered as a custom composer-pill icon and opens a small
token-count popover when pressed. The pill's accessible title carries the current count. The ring and
popover share one store keyed by agent id, so opening the popover cannot replace a live value with a
stale one-time refresh. If the subscription fails, the pills are removed and the plugin resubscribes
with exponential backoff (1s up to 30s).

Composer pills appear in each agent's composer track alongside Tasks and Subagents. The plugin API
does not expose a slot beside the built-in context meter inside the composer input, so the pill
cannot sit directly beside the meter.

## Development

Requires Node 22.18 or later, which runs the TypeScript tests without a flag.

```sh
npm install
npm run typecheck
npm test
```

After source changes:

```sh
paseo plugin reload context-progress
```
