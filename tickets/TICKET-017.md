# TICKET-017 — Guarded execution pipeline (src/tools/pipeline.ts)

**Phase:** Tools (cycle 7)
**Target file:** `src/tools/pipeline.ts`

## Capability
`executeTool(tool, args, opts?): Promise<ToolResult>` — a plain function running
`pre -> guard -> execute -> post -> result` with structured outcomes. The `guard`
hook is the load-bearing piece: it lets a caller (agent loop, cycles 10-13)
veto a tool call before the body runs.

## Required signatures (exact)
```ts
export interface PipelineOptions {
  pre?: (tool: Tool, args: unknown) => void | Promise<void>;
  guard?: (tool: Tool, args: unknown) => boolean | Promise<boolean>;
  post?: (tool: Tool, args: unknown, result: ToolResult) => void | Promise<void>;
  signal?: AbortSignal;
}
export function executeTool(
  tool: Tool,
  args: unknown,
  opts?: PipelineOptions,
): Promise<ToolResult>;
```

## Required behavior (order + outcomes)
1. `pre` (if present) runs first; it is a **void side-effect hook** (its return
   value is ignored).
2. `guard` (if present) runs next; if it returns `false`, **short-circuit to an
   `isError` result with a stable message and do NOT call `tool.execute`**.
3. If `opts.signal` is already aborted before `execute`, return an `isError`
   result **without calling `tool.execute`**.
4. `tool.execute(args)` runs; if it **throws, catch and return
   `{ content: <error message>, isError: true }`** (never let a tool body crash
   the caller).
5. `post` (if present) runs after `execute` settles; it is a **void side-effect
   hook** (its return value is ignored).
6. Return the settled `ToolResult`.

## Notes
- `pre`/`post` are void hooks (the briefing's contract), NOT result-transformers.
- The `signal` lives on `PipelineOptions`, not in a `ToolContext`.
- Compose (do not redefine) the LLM seam's `ToolDefinition` / `ToolResultBlock`
  where a projection helper is useful (optional; not required for the gate).
