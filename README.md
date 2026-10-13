# Context progress

This Paseo client plugin shows the current agent context usage against a fixed 200,000-token limit.

- Normal: Paseo's muted icon colour.
- Above 150,000 tokens: yellow.
- Above 200,000 tokens: red.

The value comes from the live `agent.lastUsage.contextWindowUsedTokens` snapshots received by the
plugin's agent subscription. The ring is registered as a custom composer-pill icon and opens a small
token-count popover when pressed. The ring and popover share the same keyed snapshot store, so
opening the popover cannot replace a live value with a stale one-time refresh.

Paseo 0.10.2 places plugin composer pills in the track row above the composer. Paseo does not expose
a plugin slot beside the built-in context meter inside the composer input, so exact left-of-meter
placement is not possible through the public plugin API.

## Development

```sh
npm install
npm run typecheck
npm test
```

After source changes:

```sh
paseo plugin reload context-progress
```
