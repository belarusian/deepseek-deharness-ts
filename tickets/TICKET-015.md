# TICKET-015 — Tool vocabulary (src/tools/types.ts)

**Phase:** Tools (cycle 7) — registry + guarded execution pipeline
**Target file:** `src/tools/types.ts`

## Capability
Define the plain tool vocabulary. No Cordis, no DI, no `ctx` key, no branded
types. A `Tool` is a plain object; the LLM seam's `ToolDefinition` /
`ToolCallBlock` / `ToolResultBlock` already exist in `src/llm/*` and are
composed, not redefined.

## Required exports (exact signatures)
- `JsonSchema` — a **minimal structural type** (NOT `Record<string, unknown>`):
  ```ts
  export interface JsonSchema {
    readonly type?: string;
    readonly properties?: Record<string, JsonSchema>;
    readonly required?: readonly string[];
    readonly [key: string]: unknown;
  }
  ```
- `ToolResult` — `{ readonly content: string; readonly isError?: boolean; readonly meta?: unknown }`.
- `ToolContext` — a plain, optional per-call bag (NOT a DI container):
  `{ readonly signal?: AbortSignal; readonly [key: string]: unknown }`.
- `Tool` — the model-facing projection plus an `execute` body:
  ```ts
  export interface Tool {
    readonly name: string;
    readonly description: string;
    readonly parameters: JsonSchema;
    execute(args: unknown, ctx?: ToolContext): Promise<ToolResult>;
  }
  ```
  A `Tool` *is* a `ToolDefinition` (name/description/parameters) plus `execute`.

## Notes
- Keep it dependency-free. JSON-Schema validation is structural/minimal this
  cycle (full validation is cycle 8-9).
- `Tool` must be structurally assignable to the LLM seam's `ToolDefinition`
  (name/description/parameters) so the pipeline can project it.
