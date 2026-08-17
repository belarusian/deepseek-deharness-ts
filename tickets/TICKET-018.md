# TICKET-018 — Barrel re-exports (src/tools/index.ts + src/index.ts)

**Phase:** Tools (cycle 7)
**Target files:** `src/tools/index.ts`, `src/index.ts`

## Capability
Expose the tools public API by direct import, matching the session/llm/deepseek
barrel conventions already in the repo.

## Required
- `src/tools/index.ts` re-exports the tools public API:
  `JsonSchema`, `Tool`, `ToolResult`, `ToolContext` (types); `ToolRegistry`,
  `DuplicateToolError` (values); `executeTool`, `PipelineOptions` (value + type).
- `src/index.ts` re-exports the tools public API from `./tools/index.js` in a
  clearly-commented section, alongside the existing session/llm/deepseek
  sections.
- No name collisions with the existing top-level re-exports (the LLM seam's
  `ToolDefinition` is already exported; the tools `Tool` is a distinct name).
