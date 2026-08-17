# TICKET-025 — define.ts: the `defineTool` factory

**Cycle:** 9 (Tools — factory + built-ins)
**File:** `src/tools/define.ts` (new)

## Capability
`defineTool(spec): Tool` where
`spec = { name; description; parameters: JsonSchema; execute: (args, ctx?) => Promise<ToolResult> }`.

A plain helper that **returns a `Tool`**. It is the *only* place a `Tool`
literal is assembled by callers, so the shape stays consistent.

## Rules
- A factory, NOT a registry: it returns a `Tool`; it does not register,
  observe, or mutate any global. `ToolRegistry` is the only place tools are
  stored.
- No class, no DI, no registration side effects.
- Composes the tools `Tool` type; does not redefine the LLM seam's
  `ToolDefinition` / `ToolCallBlock` / `ToolResultBlock`.

## Acceptance
- `defineTool` is exported from `src/tools/define.ts`.
- `defineTool(spec)` returns an object with `name`/`description`/`parameters`
  present and `execute` callable.
