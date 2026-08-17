# TICKET-046 — trajectory fold: `step/end` is derivable but must be emitted at the right boundary

**Module:** `src/agent/trajectory.ts` (new) + `src/agent/turn.ts` (durable sink)
**Cycle:** 13 (agent loop composes the session log)

## Capability
The `SessionEventMap` (`src/session/event.ts:81`) has **both** `step/start`
(`:87`) and `step/end` (`:89`). The `AgentEvent` union
(`src/agent/types.ts:51-57`) has **only** `step_start` (`:53`) — there is no
`step_end` variant. So `toSessionEvent` cannot map `step/end` from any
`AgentEvent`; the sink must **synthesize** it. The question is *where* in the
step body it is emitted, because the step body is not a single atomic unit.

## Evidence
- `src/session/event.ts:87-89` — `step/start` and `step/end` both exist, each
  `{ turn: number; step: number }`.
- `src/agent/types.ts:53` — `AgentEvent` has `step_start` only; no `step_end`.
- `src/agent/turn.ts:105` — `emit({ type: "step_start", turn: t, step })` at the
  top of the step.
- `src/agent/turn.ts:112-154` — the step body is: adapter call (`:113-120`),
  assistant push + emit (`:121-122`), no-tool-calls break (`:128-131`), or tool
  dispatch loop (`:134-154`). The step does **not** end at a single line; it
  ends either at the `break` (`:130`) or after the tool-dispatch loop
  (`:154`) before the next iteration's abort/budget checks.
- Reference fold shape (semantics only, never copy):
  `deepseek-harness/packages/core/agent-loop/src/agent.ts:292` appends
  `step/end` in a `finally` block, so it is emitted on **every** exit path
  (normal, error, abort) of the step.

## Impact
If the sink synthesizes `step/end` only on the normal path (after the tool
dispatch), then a step that ends via `end: "error"` (`:118-119`, the adapter
threw) or `end: "aborted"` (`:95-98`) or `end: "max_steps"` (`:100-103`)
leaves a `step/start` with **no matching `step/end`** in the log. The log's
step boundaries become unbalanced: a reader counting `step/start` vs
`step/end` would see a dangling open step. This breaks the contiguity/
balance invariant the session log relies on for reconstruction.

## Suggestion
- The sink must emit `step/end` on **every** exit path of a step that began
  (i.e. after `step_start` was emitted), mirroring the reference's `finally`
  semantics. Concretely, wrap the step body in a `try/finally` in the sink's
  fold so that `step/end` is appended after the assistant/tool traffic
  regardless of whether the step ended by `completed`, `error`, `aborted`, or
  `max_steps`.
- `toSessionEvent` maps `step_start → step/start` (a 1:1 mapping); `step/end`
  is synthesized by the sink, not by `toSessionEvent`. Document this in the
  `trajectory.ts` module docstring.
- The `step/end` event is **not** a `SurfaceEventType`
  (`src/session/event.ts:121-124`), so it carries no `surfaceOp`.

## Acceptance
- For every `step/start` in the log there is exactly one matching `step/end`
  with the same `{ turn, step }`, on **all** exit paths
  (`completed`, `error`, `aborted`, `max_steps`).
- `toSessionEvent` maps `step_start → step/start` and has no `step_end` case.
- A log for a turn that errors on step 2 contains `step/start(2)` and
  `step/end(2)` (balanced), then `turn/end`.
