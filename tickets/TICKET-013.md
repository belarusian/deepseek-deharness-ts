# TICKET-013: Full-seam integration test (session + llm-adapter + deepseek)

**Cycle:** 6 (synthesis)
**Priority:** P1
**Status:** open
**Target file:** `src/__tests__/integration.test.ts` (new)

## Title
Add a full-seam integration test that composes the three seams end to end:
a `SessionLog` (outer spoke) driven by an `LlmAdapter`, exercised with **both**
the deterministic `FakeLlmAdapter` and the concrete `DeepSeekLlmAdapter`
(offline, via injected `fetch`).

## Evidence
No integration test exists. `ls src/__tests__/` shows only
`deepseek.test.ts`, `llm.test.ts`, `session.test.ts`, `smoke.test.ts` - each
tests one seam in isolation. The pieces to compose are all present and
exported from `src/index.ts`:

- `src/session/log.ts:110-175` - `SessionLog` with `append(type, data,
  surfaceIntent?)`, `readAll()`, `last()`, `seq`. The `assistant/message`
  payload shape is `{ turn, step, message: { role, content }, usage? }`
  (`src/session/event.ts:110-116`).
- `src/llm/fake.ts:33-75` - `FakeLlmAdapter` is deterministic and network-free;
  ideal for the "happy path" composition.
- `src/llm/deepseek/adapter.ts:33-150` - `DeepSeekLlmAdapter` accepts an
  injectable `fetch` (`DeepSeekAdapterConfig.fetch`), so the concrete adapter
  can be driven offline (pattern already used in
  `src/__tests__/deepseek.test.ts:55-66` `okSseFetch`).
- **Note the type boundary:** the session's `AssistantMessage` is
  `{ role: "assistant"; content: string }` (`src/session/event.ts:96-99`),
  whereas the LLM seam's `AssistantMessage` is `{ role: "assistant"; blocks:
  ContentBlock[]; finishReason? }` (`src/llm/message.ts:60-62`). The test must
  translate between them (flatten text blocks into `content`) - this is the
  real composition seam the integration test must exercise.

## Spec to implement
`src/__tests__/integration.test.ts` covering, at minimum:

1. **Fake happy path:** build a `SessionLog`, append `turn/start`,
   `user/message`, call `fake.complete(...)`, translate the LLM
   `AssistantMessage` into the session `assistant/message` payload, append it,
   append `turn/end`. Assert `log.seq` contiguity (`seq === log.length`),
   `readAll()` order, and that the assistant `content` matches the fake's text.
2. **DeepSeek offline path:** build a `DeepSeekLlmAdapter` with an injected
   `fetch` returning a canned SSE body (reuse the `okSseFetch`/`sseBody`
   helpers from `deepseek.test.ts`), call `complete(...)`, translate, append to
   a `SessionLog`, and assert the same invariants.
3. **Stream path:** drive `adapter.stream(...)` to completion, fold the
   `text_delta` chunks into a single `content`, and append the assembled
   `assistant/message` to the log.
4. **Failure passthrough (ties to TICKET-011/012):** wrap the adapter in
   `withRetry`, feed a transient-then-success sequence (fake or mocked fetch),
   and assert the log records exactly one assistant message (no duplication).

## Impact
The three seams have never been composed in a single test. A regression in the
LLM->session message translation, or in how a retried stream is folded into the
log, would be invisible to the current per-seam suites.

## Suggestion
Create `src/__tests__/integration.test.ts`. Extract the LLM->session
`AssistantMessage` translation into a small local helper (flatten `text`
blocks, join with `""` or `"\n"`). Reuse the SSE helpers from
`deepseek.test.ts` (or move them to a shared `src/__tests__/helpers.ts`).
Keep the test offline: no real network, no real API key.

## Acceptance Criteria
- [ ] Composes `SessionLog` + `FakeLlmAdapter` end to end and asserts log contiguity
- [ ] Composes `SessionLog` + `DeepSeekLlmAdapter` (injected fetch) offline
- [ ] Translates LLM `AssistantMessage` (blocks) to session `assistant/message` (content)
- [ ] Exercises the stream path and folds deltas into one assistant message
- [ ] Asserts a retried stream yields exactly one assistant message in the log
