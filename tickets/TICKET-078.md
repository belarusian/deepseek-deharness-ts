# TICKET-078 — E2E: trajectory capture + streaming + step budget + error

**Cycle:** 19 (Hardening — error & trajectory capture)
**Target:** `src/__tests__/launcher.test.ts` (extend the `"E2E program run"` block)

## Capability
E2E coverage that drives the **real** `launch` and asserts **both** spokes
agree for the same turn: the inner-spoke `AgentEvent` stream (via the new
`onEvent` sink) and the outer-spoke durable log (via `readLog`).

## New cases (keep all existing cases unchanged)
- **(e) Trajectory capture.** `launch` with a tool round-trip + an `onEvent`
  sink (an array the sink appends to). Assert the inner-spoke `AgentEvent`
  stream is exactly `turn_start, step_start, assistant, tool_call,
  tool_result, step_start, assistant, turn_end` (8 events, `turn: 1`, `step`
  1 then 2, the `tool_call` names `add`, the `turn_end` reason `completed`)
  **and** the outer-spoke log still has the 8 contiguous `SessionEvent`s
  (the two spokes agree).
- **(f) Streaming.** `launch` with `--stream` + a `FakeLlmAdapter` scripted to
  a text turn. Assert exit `0`, the adapter's `stream` was called (not
  `complete`), and the log records the assembled `assistant/message`.
- **(g) Step budget.** `launch` with `--max-steps 1` + a `FakeLlmAdapter`
  scripted to a tool round-trip (which needs 2 steps). Assert exit `0` (budget
  is a clean end, not an error), `end: "max_steps"`, and the log records the
  budget (the second `step/start` is absent; `turn/end` reason `max_steps`).
- **(h) Error trajectory.** `launch` with an exhausted `FakeLlmAdapter` + an
  `onEvent` sink. Assert exit `1`, the inner-spoke stream is `turn_start,
  step_start, turn_end` with `turn_end.reason === "error"`, and the
  outer-spoke log agrees.

## Acceptance
- All four cases pass; the existing 16 cases pass unchanged.
- Deterministic: `FakeLlmAdapter` + built-in tools + temp dir + the CLI's
  default `() => 0` clock. No network, no `Date.now()`, no subprocess spawn.
- `npm test` + `npm run lint` green.
