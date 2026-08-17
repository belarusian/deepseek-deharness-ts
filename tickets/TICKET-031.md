# TICKET-031 — agent/loop.ts: runAgent step/turn driver

**Cycle:** 10 (Agent loop — plain Program, the inner spoke)
**File:** `src/agent/loop.ts` (new)

## Capability
`runAgent(opts: AgentOptions, userText: string): Promise<AgentResult>` — a plain
async function (NOT a class, NOT a Cordis service) that drives one turn through
step boundaries by direct import of the already-merged modules. No DI, no `ctx`,
no Cordis. The driver owns an in-memory `Message[]` transcript (the LLM seam
vocabulary); it does not own a `SessionLog` (that fold is the four-algebra phase,
cycles 14-17).

### Composition (the exact APIs it calls)
- **LLM seam** (`src/llm/index.js`): `adapter.complete(messages, { tools })` →
  `AssistantMessage` (`{ role: "assistant", blocks: ContentBlock[], finishReason? }`).
  Builders `message(role, blocks, callId?)`, `textBlock(text)`.
- **Tools** (`src/tools/index.js`): `toToolDefinition(tool)` → `ToolDefinition`;
  `executeTool(tool, args, { signal })` → `ToolResult` (never throws);
  `toToolResultBlock(toolCallId, result)` → `ToolResultBlock`;
  `registry.get(name)` / `registry.all()`.

### The turn/step algorithm
One `runAgent` call drives exactly **one turn**:
1. Build the transcript: prepend `system` (if set) as a system message, then the
   `user` message from `userText`.
2. Emit `turn_start`.
3. Loop `step = 1, 2, …`:
   a. If `signal?.aborted` → `end = "aborted"`, break.
   b. If `step > maxSteps` → `end = "max_steps"`, break.
   c. Emit `step_start`.
   d. `assistant = await adapter.complete(transcript, { tools: registry.all().map(toToolDefinition) })`;
      a thrown error is contained → `end = "error"`, break (never rethrown).
   e. Append `assistant` to the transcript; emit `assistant`.
   f. `calls = assistant.blocks.filter(b => b.type === "tool_call")`.
      If `calls.length === 0` → `end = "completed"`, break.
   g. For each `ToolCallBlock`:
      - Emit `tool_call`.
      - `tool = registry.get(call.name)`; if absent, synthesize an `isError`
        `ToolResult` (`"unknown tool: <name>"`) — do NOT throw.
      - `result = await executeTool(tool, JSON.parse(call.arguments), { signal })`.
      - `block = toToolResultBlock(call.id, result)`; append a `tool` message
        (`message("tool", [block], call.id)`) to the transcript; emit `tool_result`.
4. Emit `turn_end`.
5. Return `{ messages: transcript, turns: 1, steps, end }`.

### Errors / containment
- A thrown `adapter.complete` ends the turn `"error"` (contained; not rethrown).
- A pre-aborted / mid-run `signal` ends the turn `"aborted"`.
- `executeTool` never throws (it contains failures into `isError`), so a bad tool
  body cannot crash the loop. An unknown tool name yields an `isError` result.

## Acceptance
- `runAgent` is a plain async function; no class, no DI, no `ctx`.
- A no-tool turn ends `"completed"`, 1 step, transcript `[user, assistant]`.
- A tool turn runs the tool through `executeTool`, appends the `tool_result`, and
  continues to the next step; a following text-only step ends `"completed"`.
- A misbehaving adapter (always a tool call) stops at `maxSteps` with `"max_steps"`.
- An unknown tool name yields an `isError` `tool_result`, not a throw.
- A pre-aborted `signal` yields `"aborted"`.
- `onEvent` is called once per boundary (turn_start, step_start, assistant, …, turn_end).
