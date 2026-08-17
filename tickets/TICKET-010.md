# TICKET-010: LLM index + re-exports + test coverage

**Cycle:** 4
**Priority:** P0
**Status:** open

## Description
1. Create `src/llm/index.ts` re-exporting all public API from message, stream, adapter, fake.
2. Update `src/index.ts` to re-export the llm public API alongside session re-exports + Program marker.
   - Handle `AssistantMessage` naming conflict: keep session's export, LLM's is available via direct import.
3. Create `src/__tests__/llm.test.ts` with vitest coverage:
   - Message construction/identity (frozen, correct shapes)
   - Stream chunk shapes
   - FakeLlmAdapter.complete: queue drains in order
   - FakeLlmAdapter.stream: yields chunks then StreamEnd
   - LlmFailure shape (message, code, status, retryAfterMs)
   - FakeLlmAdapter throws when queue empty

Rule 4: every module has a vitest test before merge.

## Acceptance Criteria
- [ ] `src/llm/index.ts` re-exports all public types and values
- [ ] `src/index.ts` re-exports llm API (no naming conflicts)
- [ ] `src/__tests__/llm.test.ts` covers all 4 modules
- [ ] Full gate passes: build + test + lint
