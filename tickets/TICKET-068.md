# TICKET-068 — `FakeLlmAdapter` records the `CallOptions` it is called with

**Module:** `src/llm/fake.ts`

## Capability
Make `FakeLlmAdapter` record the `CallOptions` it is called with so tests can
assert the `model`/`maxTokens` passthrough without a live provider.

## Behavior
- Rename the ignored `_opts` to `opts` in both `complete` and `stream`.
- Record each call's `opts` (e.g. a `readonly callOptions: readonly
  (CallOptions | undefined)[]` array appended on every `complete`/`stream`,
  plus a `readonly lastCallOptions?: CallOptions` getter).
- Keep the scripted-response behavior identical: the queue, `remaining`, and
  the `exhausted` throw are unchanged.

## Constraints
- The recording must not change the scripted-response behavior.
- Additive only: existing callers that never inspect the recording are
  unaffected.
