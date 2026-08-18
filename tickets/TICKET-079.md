# TICKET-079 — Direct `Program.onEvent` coverage (optional)

**Cycle:** 19 (Hardening — error & trajectory capture)
**Target:** `src/__tests__/program.test.ts`

## Capability
Direct unit coverage of the `onEvent` seam at the `Program` layer (the E2E
cases in TICKET-078 cover it through `launch`; this pins the seam at the
`Program` boundary).

## New cases
- A `Program` constructed with `onEvent` emits the `AgentEvent` stream to the
  sink (assert the sink received the events in order).
- A `Program` with no `onEvent` is unchanged (the sink is never called).

## Acceptance
- Both cases pass; existing `program.test.ts` cases pass unchanged.
- `npm test` + `npm run lint` green.
