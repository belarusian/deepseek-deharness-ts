# TICKET-065 — `AgentOptions.callOptions` + thread into the `runTurn` adapter call

**Module:** `src/agent/types.ts`, `src/agent/turn.ts`

## Capability
Add an optional `callOptions` field to `AgentOptions` and thread it into the
adapter call in the shared step/turn core, so the caller can select the model
and cap the output tokens.

## Behavior
- `src/agent/types.ts`: add `readonly callOptions?: CallOptions` to
  `AgentOptions` (import the `CallOptions` type from `../llm/index.js`).
  Document that it is the provider call options (`model`/`maxTokens`/
  `temperature`) threaded to the adapter call; `tools` is still projected
  separately by the loop.
- `src/agent/turn.ts`: at the adapter call site, merge the loop's projected
  `tools` with the caller's `callOptions`:
  `opts.adapter.complete(transcript, { ...opts.callOptions, tools })` and
  `opts.adapter.stream(transcript, { ...opts.callOptions, tools })`. The loop's
  `tools` projection **wins** (authoritative tool list for this turn);
  `model`/`maxTokens`/`temperature` come from `callOptions`. When `callOptions`
  is absent, the call is exactly `{ tools }` as before (behavior unchanged).

## Constraints
- Additive only: `callOptions` is optional; when absent the adapter call is
  byte-for-byte identical to before, so all existing tests pass unchanged.
- The loop's `tools` projection always wins over any `tools` in `callOptions`.
