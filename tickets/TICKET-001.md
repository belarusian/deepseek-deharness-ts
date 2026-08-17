# TICKET-001: Define the `SessionEvent` discriminated-union vocabulary

**Status:** open
**Deliverable:** 1 of 4 (outer spoke)
**Target file:** `src/session/event.ts` (new)

## Title
Define the `SessionEvent` discriminated-union vocabulary of durable facts
(user message, assistant message, tool call, tool result, turn/step markers)
with stable `seq` ids and `time` timestamps.

## Evidence
The target repo has no event vocabulary: `src/index.ts` exports only the
`Program` marker (`src/index.ts:22-27`) and there is no `src/session/`
directory. The canonical semantics live in the reference:

- `packages/core/session/src/types.ts:404` — `SessionEvent<T>` is a **proper
  discriminated union** (a mapped type over `SessionEventType`), so
  `switch (event.type)` narrows `event.data` without casts. Each variant
  carries `type`, `seq` (monotonic), `time` (Unix epoch ms), `data`, an
  optional `ignorable?: true` guard, and — only on surface-eligible types —
  `surfaceOp` / `sourceEventSeqs`.
- `packages/core/session/src/types.ts:236` — `SessionEventMap` is the
  vocabulary: `turn/start`, `turn/end`, `step/start`, `step/end`,
  `user/message`, `assistant/message`, `tool/call`, `tool/result`, plus
  log-only extension types (`todo/write`, `request/header`,
  `request/context`, `session/end-seed`).
- `packages/core/session/src/types.ts:336` — `SessionEventType =
  keyof SessionEventMap`.
- `packages/core/session/src/types.ts:343` — `SurfaceEventType` is the
  subset that produces LLM messages (`user/message`, `assistant/message`,
  `tool/result`).
- `packages/core/session/src/types.ts:56` — `SESSION_FORMAT_VERSION = 0`,
  stamped into every header and enforced on load.
- `packages/core/session/src/types.ts:61` — `SessionHeader` (immutable
  storage metadata kept **outside** the event log).

## Impact
Without this vocabulary the other three deliverables have no type to build
on: `SessionLog.append` cannot be typed, the JSONL seam has no record shape
to serialize, and the re-export surface has nothing to re-export. The
discriminated-union shape is load-bearing — if `SessionEvent` is written as
independent `type`/`data` unions (a common shortcut), `switch (event.type)`
stops narrowing and every consumer needs casts, silently weakening the
durable contract.

## Suggestion
Create `src/session/event.ts` exporting:
- `SessionHeader` (immutable, with `version`, `id`, `createdAt`, optional
  `cwd` / `parentSession` / `seedLength` / `delegationDepth` / `agentPreset`).
- `SESSION_FORMAT_VERSION = 0`.
- The `SessionEventMap` for the **core** vocabulary this cycle needs:
  `turn/start`, `turn/end`, `step/start`, `step/end`, `user/message`,
  `assistant/message`, `tool/call`, `tool/result`. (Extension types like
  `todo/write` / `request/header` are out of scope for the outer spoke and
  can be added by later cycles — the union is merge-extensible by design.)
- `SessionEvent<T>` as a mapped discriminated union over `type`, carrying
  `seq`, `time`, `data`, optional `ignorable`, and conditional
  `surfaceOp` / `sourceEventSeqs` on `SurfaceEventType` variants.
- `SessionEventType`, `SurfaceEventType` aliases.

Keep the message payloads minimal and JSON-serializable (the reference's
`UserMessage` / `AssistantMessage` / `ToolResultMessage` come from
`@deepseek-ai/dsh-llm`; this repo has no such dependency, so define local
minimal shapes — see TICKET-005 for the lossless-JSON boundary they must
satisfy). No DI: these are plain types and a version constant.
