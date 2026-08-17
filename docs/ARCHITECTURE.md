# Architecture — outer spoke: the append-only session log

This repo is the **inversion** of `deepseek-harness` + `cordis`. In the
reference, the session log is a Cordis `Service` reached through a `Context`
(`ctx.sessions.create(...)`, `session/event` / `session/flush` events, a
`SessionStore` that owns publication hooks). Here the same durable semantics
are **plain TypeScript modules with clean APIs that compose directly** — no
Cordis plugin tree, no DI container, no profiles/bundles/patches.

## The four algebra, and where this cycle lands

The system is organized by the four algebra. The **inner spoke** is work +
trajectory (agent loop, tools). The **outer spoke** is the append-only log.
This cycle (Cycle 2 synthesis) builds the outer spoke as four plain modules:

1. **`SessionEvent` vocabulary** — a discriminated union of durable facts
   (user message, assistant message, tool call, tool result, turn/step
   markers) with stable `seq` ids and `time` timestamps.
2. **`SessionLog`** — an append-only log over an in-memory store:
   `append` / `readAll` / `since` / `last`.
3. **JSONL persistence seam** — serialize/deserialize the log to disk.
4. **Public re-export surface** — `src/index.ts` re-exports the above.

## The DI inversion (the load-bearing contract)

| Reference (Cordis) | This repo (plain module) |
|---|---|
| `ctx.sessions.create(id, { seed, meta })` | `new SessionLog(id, { seed, header })` |
| `session.append(type, data, surfaceIntent)` | `log.append(type, data, surfaceIntent)` |
| `session.events` (frozen snapshot) | `log.readAll()` |
| `session.seq` (= log.length) | `log.seq` / `log.last()` |
| `session/event` firehose (DI dispatch) | **none** — no observer bus; the log is the source of truth |
| `session/flush` (DI parallel checkpoint) | **none** — persistence is an explicit `serialize`/`scanLog` call |
| `SessionStore extends Service` | **none** — no store; one log per session, composed by the caller |

The inversion is deliberate: the durable **semantics** (event vocabulary,
`seq = log.length` contiguity, lossless-JSON validation, header line, torn-tail
recovery) are preserved verbatim; only the **wiring** (DI, event bus, store
service) is removed. A consumer composes by importing modules, not by
registering plugins.

## Durable-event semantics (preserved from the reference)

- **Proper discriminated union.** `SessionEvent<T>` is a mapped type over
  `SessionEventType`, so `switch (event.type)` narrows `event.data` without
  casts. (Reference: `types.ts:404`.)
- **Stable ids + timestamps.** Every event carries `seq` (monotonic,
  `seq = log.length` — the contiguity contract the whole system relies on) and
  `time` (Unix epoch ms). (Reference: `index.ts:604` `append`.)
- **Lossless-JSON boundary.** Every event `data` must round-trip through JSON
  byte-identically. `append` validates and **detaches** (snapshots) the data so
  reading `event.data` back sees the logged value, never the caller's
  still-mutable input. (Reference: `json.ts:177` `snapshotJsonValue`.)
- **Conditional surface metadata.** `surfaceOp` / `sourceEventSeqs` exist only
  on surface-eligible event types; the compiler enforces this at `append` call
  sites. (Reference: `types.ts:404`.)
- **`ignorable` guard.** Absent means *required*: a reader meeting an
  unrecognized type without the marker MUST refuse to reconstruct rather than
  silently drop the event. (Reference: `types.ts:404`.)

## JSONL persistence semantics (preserved from the reference)

- **Header line first.** The first JSONL record is the immutable
  `SessionHeader` tagged `type: 'session'`, so a reader distinguishes it from
  an event line. (Reference: `session-persistence-jsonl/format.ts`
  `toHeaderLine` / `isHeaderLine`.)
- **One event per line.** Each subsequent line is one `SessionEvent` verbatim
  (or a packed chunk row in the reference; this cycle stores events verbatim —
  see TICKET-005).
- **Torn-tail recovery.** A final record without a trailing newline is a torn
  write and is ignored; the contiguous committed prefix is preserved.
  (Reference: `format.ts` `SessionLogScanner` / `scanLog`.)
- **Version gate.** The header stamps `SESSION_FORMAT_VERSION`; a backend
  rejects any other version on load (no migration while unreleased).
  (Reference: `types.ts:56`.)

## Module layout (target)