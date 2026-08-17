# TICKET-014: Re-export the retry API from the public surface

**Cycle:** 6 (synthesis)
**Priority:** P1
**Status:** open
**Target files:** `src/llm/index.ts` (extend), `src/index.ts` (extend)

## Title
Re-export `withRetry` and `RetryOptions` from `src/llm/index.ts` and from the
root `src/index.ts`, so downstream modules (the agent loop, cycles 10-13)
compose the retry wrapper by direct import - consistent with how every other
seam is exposed.

## Evidence
The repo's composition contract is "direct import, not registration"
(`src/index.ts:1-12`, `docs/ARCHITECTURE.md`). Every other LLM seam is
re-exported at both levels:

- `src/llm/index.ts:40-44` re-exports `LlmFailure`, `ToolDefinition`,
  `CallOptions`, `LlmAdapter` from `./adapter.js`.
- `src/llm/index.ts:46-49` re-exports `FakeLlmAdapter`, `ScriptedResponse`.
- `src/index.ts:78-81` re-exports the adapter surface from `./llm/index.js`.

A new `src/llm/retry.ts` (TICKET-011) that is not re-exported would be
reachable only by reaching into `src/llm/retry.js` directly, breaking the
established pattern and the "compose by direct import" rule.

## Spec to implement
- `src/llm/index.ts`: add
  `export { withRetry, type RetryOptions } from "./retry.js";`
- `src/index.ts`: add
  `export { withRetry, type RetryOptions } from "./llm/index.js";`
  placed alongside the existing LLM-seam re-exports (after the `LlmFailure`
  block, before/with the `FakeLlmAdapter` block).

## Impact
Without re-exports, the retry wrapper is invisible to the public API and to
the agent loop that will consume it. Consumers would have to import from a
non-public path, which the codebase's own docs forbid.

## Suggestion
Add the two `export` lines above. No naming conflict is expected: `withRetry`
and `RetryOptions` are new identifiers not currently exported anywhere
(`grep -rn "withRetry\|RetryOptions" src/` returns nothing).

## Acceptance Criteria
- [ ] `import { withRetry } from "deepseek-deharness-ts"` (root) resolves
- [ ] `import { withRetry, RetryOptions } from "./llm/index.js"` resolves
- [ ] `tsc -p tsconfig.json` still builds clean
- [ ] No duplicate/conflicting export names introduced
