# TICKET-047 — `toSessionEvent` is a payload transformation, not a plain rename (lossy assistant flattening)

**Module:** `src/agent/trajectory.ts` (new)
**Cycle:** 13 (agent loop composes the session log)

## Capability
The target calls `toSessionEvent` "a plain, total mapping from the driver's
`AgentEvent` union to the session's `SessionEvent` union." That is accurate for
the **envelope** (type rename + `seq`/`time` assignment) but understates the
**payload** work: the `AgentEvent` payloads are the LLM seam's types
(`src/llm/message.ts`), while the `SessionEventMap` payloads are the session's
own minimal JSON types (`src/session/event.ts:48-72`). The two do not share
shapes, so `toSessionEvent` must **transform** each payload, and one
transformation (assistant) is **lossy**.

## Evidence
- `src/agent/types.ts:54` — `AgentEvent.assistant.message` is the LLM
  `AssistantMessage` (`src/llm/message.ts:56` = `Message & { role: "assistant" }`),
  which carries `blocks: readonly ContentBlock[]` (`src/llm/message.ts:48`) and
  `finishReason?` (`:52`).
- `src/session/event.ts:93-98` — `SessionEventMap["assistant/message"].message`
  is the session `AssistantMessage` (`:55-58`) = `{ role: "assistant"; content: string }`.
  It has **no `blocks`**, **no `finishReason`** — only a single `content: string`.
- `src/agent/types.ts:55` — `AgentEvent.tool_call.call` is the LLM
  `ToolCallBlock` (`src/llm/message.ts:21-29`) = `{ type; id; name; arguments }`.
- `src/session/event.ts:100-106` — `SessionEventMap["tool/call"]` =
  `{ turn; step; callId; name; arguments }`. Field rename `id → callId`; `type`
  dropped.
- `src/agent/types.ts:56` — `AgentEvent.tool_result.result` is the LLM
  `ToolResultBlock` (`src/llm/message.ts:32-40`) = `{ type; toolCallId; content; isError? }`.
- `src/session/event.ts:108-114` — `SessionEventMap["tool/result"].message` is the
  session `ToolResultMessage` (`:61-65`) = `{ role: "tool"; callId; content }`,
  wrapped in `message`, with `error?` / `meta?` siblings. Rename
  `toolCallId → callId`; `type` dropped; `isError?` must map to `error?` (or be
  dropped).

## Impact
If `toSessionEvent` is implemented as a field rename (the "plain mapping"
reading), it will not type-check: the LLM `AssistantMessage` has no `content`
field to copy, and the session `AssistantMessage` has no `blocks` field to
receive. The implementer must discover the flattening requirement by
type-error. More importantly, the assistant flattening is **lossy**: the
session log's `assistant/message` carries only a `content: string`, so the
assistant's `tool_call` blocks and `finishReason` are **not** recorded in the
assistant event (the tool calls are recorded separately as `tool/call` events,
which is the intended design — but it must be stated, not left implicit).

## Suggestion
- Document in the `trajectory.ts` module docstring that `toSessionEvent` is a
  **payload transformation**, not a rename, and enumerate the three
  transformations:
  1. `assistant`: flatten `blocks[]` → `content: string` by concatenating the
     `text` blocks (in order); `tool_call` blocks are intentionally omitted
     here (they are recorded as separate `tool/call` events); `finishReason`
     is dropped (the session `AssistantMessage` has no field for it).
  2. `tool_call`: `id → callId`, drop `type`.
  3. `tool_result`: `toolCallId → callId`, wrap `{ role: "tool", callId, content }`
     in `message`, map `isError?` → `error?` (decide the exact `error` shape:
     `{ name, code }` per `src/session/event.ts:112` — TBD how `isError: true`
     maps to a `{ name, code }` pair; the LLM `ToolResultBlock` carries no
     `name`/`code`, so this is a semantic gap — see Suggestion note).
- The `tool/result` `error?` field is `{ name: string; code: string }`
  (`src/session/event.ts:112`), but the LLM `ToolResultBlock.isError` is a bare
  `boolean` with no `name`/`code`. The fold must decide how to populate `error`
  (e.g. `{ name: "tool_error", code: "UNKNOWN" }` when `isError` is true) or
  leave `error` absent. This is a **TBD** that must be resolved before
  implementation; do not guess.
- Keep `toSessionEvent` pure and total over the six `AgentEvent` variants; the
  `seq`/`time` assignment is the sink's job (it owns the `SessionLog`), not
  `toSessionEvent`'s.

## Acceptance
- `toSessionEvent` type-checks against the real `SessionEventMap` (no casts).
- The assistant flattening is documented as lossy (tool_call blocks and
  finishReason are not in the assistant event).
- The `tool/result` `error?` mapping is resolved (not TBD) and documented.
- `toSessionEvent` does not assign `seq`/`time` (the sink does, via
  `SessionLog.append`).
