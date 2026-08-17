# TICKET-027 — barrels: re-export the new tools public API

**Cycle:** 9 (Tools — factory + built-ins)
**Files:** `src/tools/index.ts`, `src/index.ts`

## Capability
Add `defineTool`, `echoTool`, `addTool`, `failTool` to the tools public API.

## Rules
- `src/tools/index.ts` re-exports `defineTool` (from `./define.js`) and
  `echoTool`/`addTool`/`failTool` (from `./builtins.js`).
- `src/index.ts` re-exports the new tools public API from `./tools/index.js`.
- Do not redefine LLM vocabulary; `ToolDefinition`/`ToolCallBlock`/
  `ToolResultBlock` stay in `src/llm/*`.

## Acceptance
- `import { defineTool, echoTool, addTool, failTool } from "../index.js"`
  resolves in a test.
