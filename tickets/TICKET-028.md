# TICKET-028 — builtins.test.ts: vitest coverage + end-to-end composition

**Cycle:** 9 (Tools — factory + built-ins)
**File:** `src/__tests__/builtins.test.ts` (new)

## Capability
Vitest coverage:
- (a) `defineTool` returns a well-formed `Tool` (name/description/parameters/
  execute present, `execute` callable).
- (b) each built-in's `execute` returns the expected `ToolResult`.
- (c) **end-to-end composition** — register `addTool` in a `ToolRegistry`, run
  it through `executeTool` with valid args (passes validation → execute →
  result), with invalid args (short-circuits to `isError` without execute), and
  project the result with `toToolResultBlock`.
- (d) `failTool` through the pipeline yields `isError` and `post` is skipped.

## Acceptance
- `src/__tests__/builtins.test.ts` exists and all cases pass.
- The invalid-args case asserts `execute` is NOT called (short-circuit).
- The `failTool` case asserts `post` is NOT called.
