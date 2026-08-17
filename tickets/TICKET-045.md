# TICKET-045 — trajectory fold: `user/message` has no `AgentEvent` source

**Module:** `src/agent/trajectory.ts` (new) + `src/agent/turn.ts` (durable sink)
**Cycle:** 13 (agent loop composes the session log)

## Capability
The target describes `toSessionEvent` as "a plain, total mapping from the
driver's `AgentEvent` union to the session's `SessionEvent` union." That
characterization is **incomplete**: the fold is not a 1:1 mapping. The
`SessionEventMap` (`src/session/event.ts:81`) contains a `user/message` variant
(`:91`) that has **no corresponding `AgentEvent` variant**
(`src/agent/types.ts:51-57` has no `user` member). The `AgentEvent` union begins
at `turn_start`; the user message is appended to the transcript by `runTurn`
(`src/agent/turn.ts:86`) but is never emitted as an `AgentEvent`.

## Evidence
- `src/agent/types.ts:51-57` — `AgentEvent` = `turn_start | step_start |
  assistant | tool_call | tool_result | turn_end`. No `user` variant.
- `src/session/event.ts:91` — `SessionEventMap["user/message"] = UserMessage`
  (`{ role: "user"; content: string }`).
- `src/agent/turn.ts:86` — `transcript.push(message("user", [textBlock(userText)]))`
  happens **before** `emit({ type: "turn_start", ... })` (`:88`), and there is no
  `emit` for the user message.
- Reference fold shape (semantics only, never copy):
  `deepseek-harness/packages/core/agent-loop/src/agent.ts:283` appends
  `user/message` with `{ surfaceOp: "append" }` inside the step loop.

## Impact
If `toSessionEvent` is written as a pure `AgentEvent → SessionEvent` function,
the `user/message` durable fact is **silently dropped** from the log. The log
would open with `turn/start` and never record the user's input — the first
surface fact of the session is missing. Any reader reconstructing the
conversation surface from the log would see an assistant reply with no
preceding user message.

## Suggestion
The durable sink in `runTurn` (the `emit` closure, `src/agent/turn.ts:81-83`)
must **synthesize** `user/message` directly from `userText` — it cannot be
derived from an `AgentEvent`. Concretely:
- The sink appends `user/message` (data `{ role: "user", content: userText }`,
  `surfaceOp: "append"`) **before** it folds the `turn_start` event, matching
  the transcript order (`user` is pushed before `turn_start` is emitted).
- `toSessionEvent` remains a pure, total mapping over the six `AgentEvent`
  variants; the `user/message` synthesis lives in the sink, not in
  `toSessionEvent`. Document this split explicitly in the `trajectory.ts`
  module docstring so the "plain, total mapping" claim is scoped to the six
  variants and the synthesis is named as a separate concern.
- The `user/message` event is a `SurfaceEventType`
  (`src/session/event.ts:121-124`), so it must carry `surfaceOp: "append"`.

## Acceptance
- A log composed by the sink for a single `runAgent` turn contains, in order:
  `user/message`, `turn/start`, `step/start`, `assistant/message`, …,
  `turn/end`.
- `toSessionEvent` is total over the six `AgentEvent` variants and does not
  reference `userText`.
- The `user/message` event's `data.content` equals the `userText` passed to
  `runTurn`.
