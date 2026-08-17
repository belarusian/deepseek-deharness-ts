# TICKET-002: Build the append-only `SessionLog` (in-memory store)

**Status:** open
**Deliverable:** 2 of 4 (outer spoke)
**Target file:** `src/session/log.ts` (new)

## Title
Build the append-only `SessionLog`: `append(event)`, `readAll()`, `since(id)`,
`last()` over an in-memory store. The outer spoke of the four algebra. No
registration effects, no `ctx` key, no observer bus.

## Evidence
The reference's `Session` (a Cordis `Service`) owns an append-only event log
with `seq = log.length` contiguity and a frozen `events` snapshot. The durable
semantics to preserve, minus the DI wiring:

- `packages/core/session/src/index.ts` — `Session.append(type, data, ...)`
  assigns `seq = this.events.length` (contiguous, monotonic) and `time` (Unix
  epoch ms), validates `data` is lossless-JSON, and **detaches** (snapshots)
  the data so a later read of `event.data` returns the logged value, never the
  caller's still-mutable input.
- `packages/core/session/src/invariant.ts` — the contiguity invariant: `seq`
  values are exactly `0..n-1` in order; a gap is a corrupt log.

The inversion: `ctx.sessions.create(...)` becomes `new SessionLog(id, { seed,
header })`; `session.append(...)` becomes `log.append(...)`; `session.events`
becomes `log.readAll()`; `session.seq` becomes `log.seq` / `log.last()`. No
`session/event` firehose, no `session/flush` — persistence is an explicit
`serialize`/`scanLog` call (TICKET-003).

## Impact
This is the load-bearing runtime of the outer spoke. Without it the vocabulary
(TICKET-001) is inert and the persistence seam (TICKET-003) has nothing to
serialize. The contiguity contract (`seq = log.length`) is what makes `since` /
`last` / replay correct; if `append` allows gaps or reorders, every downstream
replay is silently wrong.

## Suggestion
Create `src/session/log.ts` exporting a `SessionLog` class (or factory) with:
- `constructor(id: string, opts?: { seed?: readonly SessionEvent[]; header?: SessionHeader })`
  — `seed` replays existing events (their `seq` are preserved); `header` is
  stamped from `SESSION_FORMAT_VERSION` when absent.
- `append(type, data, surfaceIntent?)` — builds the `SessionEvent` with
  `seq = this.#events.length`, `time = Date.now()` (injectable clock for
  tests), validates `data` is lossless-JSON, detaches it, pushes, returns the
  new event.
- `readAll(): readonly SessionEvent[]` — frozen snapshot, never the live array.
- `since(seq: number): readonly SessionEvent[]` — events with `seq >= seq`.
- `last(): SessionEvent | undefined` — the highest-`seq` event, or `undefined`.
- `get seq(): number` — `this.#events.length` (the contiguity value).
- `get header(): SessionHeader` — the immutable header.

Keep it a plain class: no DI, no `ctx`, no registration side effects. The
in-memory store is the single source of truth; persistence (TICKET-003) is a
separate explicit seam, not a hidden observer.
