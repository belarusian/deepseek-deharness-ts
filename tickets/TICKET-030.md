# TICKET-030 — agent/types.ts: AgentOptions / AgentEvent / TurnEndReason / AgentResult

**Cycle:** 10 (Agent loop — plain Program, the inner spoke)
**File:** `src/agent/types.ts` (new)

## Capability
The agent-loop vocabulary. Plain TypeScript types only — no DI, no `ctx`, no
Cordis event seams. Everything is imported, not registered. Composes (does not
redefine) the LLM seam's `AssistantMessage` / `ToolCallBlock` / `ToolResultBlock`
/ `Message` and the tools `ToolRegistry`.

### `TurnEndReason`
`"completed" | "max_steps" | "aborted" | "error"`.
- `"completed"` — the assistant produced a step with no tool calls (text-only reply).
- `"max_steps"` — the per-turn step cap (`maxSteps`) was reached.
- `"aborted"` — the caller's `AbortSignal` fired.
- `"error"` — `adapter.complete` threw (contained; the driver never rethrows).

### `AgentOptions`
The plain options bag `runAgent` takes. `adapter` and `tools` are required; the
rest optional:
- `adapter: LlmAdapter` — the LLM seam (`src/llm/adapter.ts`).
- `tools: ToolRegistry` — the tool registry (`src/tools/registry.ts`).
- `system?: string` — a system-role message prepended to the transcript.
- `maxSteps?: number` — per-turn step cap (default 10 when absent).
- `signal?: AbortSignal` — caller cancellation, checked at each step boundary and
  threaded to `executeTool`'s `PipelineOptions.signal`.
- `onEvent?: (event: AgentEvent) => void` — the trajectory hook (the inner spoke).

### `AgentEvent`
The plain, serializable trajectory the driver emits per boundary. A discriminated
union over `type` (underscore names, matching the briefing):
- `{ type: "turn_start"; turn: number }`
- `{ type: "step_start"; turn: number; step: number }`
- `{ type: "assistant"; turn: number; step: number; message: AssistantMessage }`
  (the LLM seam's `AssistantMessage`, `src/llm/message.ts` — NOT the session's
  same-named type; import from `../llm/index.js`)
- `{ type: "tool_call"; turn: number; step: number; call: ToolCallBlock }`
- `{ type: "tool_result"; turn: number; step: number; result: ToolResultBlock }`
- `{ type: "turn_end"; turn: number; reason: TurnEndReason }`

### `AgentResult`
The terminal value `runAgent` resolves to:
- `messages: readonly Message[]` — the full transcript (system?, user, assistant…, tool…).
- `turns: number` — turns driven (1 for a single `runAgent` call).
- `steps: number` — model calls made this turn.
- `end: TurnEndReason` — why the turn ended.

## Acceptance
- `src/agent/types.ts` exists; every type is exported.
- `AgentEvent` references the LLM seam's `AssistantMessage` / `ToolCallBlock` /
  `ToolResultBlock` (imported from `../llm/index.js`), not redefined.
- No runtime values, no classes, no side effects in this module.
