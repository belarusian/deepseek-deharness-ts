# TICKET-009: Fake LLM adapter (src/llm/fake.ts)

**Cycle:** 4
**Priority:** P0
**Status:** open

## Description
Create a deterministic fake adapter in `src/llm/fake.ts`:
- `ScriptedResponse` = { message: AssistantMessage; chunks?: readonly StreamChunk[] }
- `FakeLlmAdapter` implements `LlmAdapter`:
  - Constructor takes `readonly ScriptedResponse[]`
  - `complete()`: pops next from queue, returns message; throws `LlmFailure` if empty
  - `stream()`: yields chunks (or derived from first text block) then `StreamEnd`; throws if queue empty
  - `remaining` getter: number of responses left

Deterministic, no network. Lets the agent loop and session compose the seam without a live provider.

## Acceptance Criteria
- [ ] Implements `LlmAdapter` interface
- [ ] Queue drains in order
- [ ] `stream()` yields chunks then StreamEnd
- [ ] Throws `LlmFailure` when queue is exhausted
- [ ] No network calls
