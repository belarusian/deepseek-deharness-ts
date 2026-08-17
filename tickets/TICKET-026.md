# TICKET-026 — builtins.ts: concrete dependency-free built-in tools

**Cycle:** 9 (Tools — factory + built-ins)
**File:** `src/tools/builtins.ts` (new)

## Capability
Three built-in `Tool`s, each built via `defineTool`:
- `echoTool` — returns its `args` as JSON in `content` (schema: object, open).
- `addTool` — `parameters: { type:'object', properties:{ a:{type:'number'},
  b:{type:'number'} }, required:['a','b'] }`; returns `a+b` as a string.
- `failTool` — always returns an `isError` result (exercises the pipeline's
  failure path).

## Rules
- Dependency-free and deterministic: no network, no filesystem, no `Date.now()`.
- `addTool` arithmetic must be exact for the test inputs.
- Each is a `Tool` built via `defineTool` (not a hand-assembled literal).

## Acceptance
- `echoTool`, `addTool`, `failTool` are exported from `src/tools/builtins.ts`.
- Each is a well-formed `Tool` (name/description/parameters/execute).
