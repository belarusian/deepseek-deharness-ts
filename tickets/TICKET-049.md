# TICKET-049 — `toSessionEvent` return type: `SessionEvent` vs the `SessionLog.append` input triple

**Module:** `src/agent/trajectory.ts` (new) + `src/agent/turn.ts` (durable sink) + `src/session/log.ts`
**Cycle:** 13 (agent loop composes the session log)

## Capability
The target describes `toSessionEvent` as "a plain, total mapping from the
driver's `AgentEvent` union to the session's `SessionEvent` union." Read
literally, this types the function as `(event: AgentEvent) => SessionEvent`.
But a `SessionEvent` (`src/session/event.ts:139-155`) **requires** `seq: number`
and `time: number`, and the `SessionLog` assigns those itself in `append`
(`src/session/log.ts:112-138`: `seq = this.#events.length`, `time = this.#clock()`).
The sink in `runTurn` cannot push directly into the log's private `#events`
array (`src/session/log.ts:87` — `readonly #events: SessionEvent[] = []`), so it
**must** call `log.append(type, data, surfaceIntent?)`. This means
`toSessionEvent` cannot return a full `SessionEvent` that the sink consumes
directly; it must return the **inputs** to `append`.

## Evidence
- `src/session/event.ts:139-155` — `SessionEvent<T>` requires `type`, `seq`,
  `time`, `data`, and optional `ignorable`/`surfaceOp`/`sourceEventSeqs`.
- `src/session/log.ts:112-138` — `SessionLog.append(type, data, surfaceIntent?)`
  constructs the full `SessionEvent` internally: `seq = this.#events.length`
  (`:122`), `time = this.#clock()` (`:123`), `data = detach(data)` (`:124`).
- `src/session/log.ts:87` — `#events` is private; the only public write path is
  `append`. The sink cannot bypass it.
- `src/agent/turn.ts:81-83` — the current `emit` closure is
  `(event: AgentEvent) => { if (opts.onEvent) opts.onEvent(event); }`. The
  durable sink must be added here: if `opts.log` is present, fold the event and
  call `log.append`.
- `src/agent/types.ts:37-45` — `AgentOptions` currently has no `log` field. The
  target adds `log?: SessionLog`. The sink reads `opts.log` in the `emit`
  closure.

## Impact
If `toSessionEvent` is typed as `(event: AgentEvent) => SessionEvent` (the
literal reading of the target), the implementer must fill in `seq` and `time`
with sentinel values (e.g. `seq: 0, time: 0`), and the sink must then
**destructure** the returned `SessionEvent` to extract `type`, `data`, and
`surfaceOp`/`sourceEventSeqs` before calling `log.append` — which **reassigns**
`seq` and `time`, discarding the sentinels. This is wasteful, confusing, and
invites a bug where the sentinel `seq`/`time` leak into the log if the sink
accidentally pushes the `SessionEvent` directly (which it can't, but the typing
makes it look possible).

More subtly: the `SessionEvent` type is a **mapped discriminated union**
(`src/session/event.ts:139-155`), so `toSessionEvent`'s return type is a union
over the session event types, each with a different `data` shape. The sink must
narrow on `type` to call `log.append` with the correct `data` type. If
`toSessionEvent` returns a full `SessionEvent`, the narrowing is on the
`SessionEvent` union; if it returns the `append` input triple, the narrowing is
on a simpler union. The latter is cleaner.

## Suggestion
- Type `toSessionEvent` to return the **inputs** to `SessionLog.append`, not a
  full `SessionEvent`. Concretely, a discriminated union over the session event
  types that `toSessionEvent` can produce (the six `AgentEvent` variants map to
  `turn/start`, `turn/end`, `step/start`, `assistant/message`, `tool/call`,
  `tool/result` — note: **not** `step/end` or `user/message`, which the sink
  synthesizes separately, see TICKET-045 and TICKET-046):