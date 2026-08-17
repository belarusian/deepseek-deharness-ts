# TICKET-004: Public re-export surface + vitest coverage

**Status:** open
**Deliverable:** 4 of 4 (outer spoke)
**Target files:** `src/index.ts` (extend), `src/__tests__/session.test.ts` (new)

## Title
Re-export the session public API from `src/index.ts` so downstream modules
compose it by direct import, and add vitest coverage for every session module
before merge.

## Evidence
Rule 4 of the runner: *every module has a vitest test before merge.* The
scaffold's `src/index.ts` currently exports only the `Program` marker
(`src/index.ts:22-27`). The session modules (TICKET-001/002/003) must be
composed by **direct import**, not registration — so the public surface must
re-export their types and values.

The reference's session tests (`packages/core/session/tests/*.spec.ts`) cover
the properties this cycle must prove:
- append/read ordering and `seq` contiguity (`invariant.spec.ts`),
- `since` / `last` slicing,
- lossless-JSON round-trip (data detaches from the caller's mutable input),
- torn-tail recovery and the version gate on load.

## Impact
Without the re-export surface, downstream modules (llm-adapter, tools, agent
loop in later cycles) cannot import the session API cleanly — they'd reach into
`src/session/*` paths directly, coupling to internal layout. Without the tests,
the contiguity / round-trip / torn-tail contracts are unproven and a regression
would be silent.

## Suggestion
- Extend `src/index.ts` to re-export the session public API:
  `export { SessionLog } from "./session/log.js";`
  `export { serializeLog, deserializeLog, writeLog, readLog, encodeSegment } from "./session/store.js";`
  `export type { SessionEvent, SessionEventType, SurfaceEventType, SessionHeader, ... } from "./session/event.js";`
  `export { SESSION_FORMAT_VERSION } from "./session/event.js";`
  Keep the existing `Program` marker.
- Create `src/__tests__/session.test.ts` (vitest) covering:
  - append/read ordering: `readAll()` returns events in `seq` order; `seq` is
    contiguous `0..n-1`.
  - id monotonicity: each `append` yields a strictly increasing `seq`.
  - `since(id)`: returns exactly the events with `seq >= id`; `since(0)` is the
    whole log; `since(n)` is empty.
  - `last()`: the highest-`seq` event; `undefined` on an empty log.
  - lossless-JSON round-trip: appending an object, mutating the caller's
    reference afterward, then `readAll()` still shows the logged (detached)
    value.
  - persistence round-trip: `serializeLog` → `deserializeLog` reproduces the
    header + events byte-semantically; a torn final line (no trailing `\n`) is
    ignored; a wrong version is rejected.

Every module (event, log, store) is exercised before merge.
