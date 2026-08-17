# TICKET-075 — Thread `onEvent` through `Program`

**Cycle:** 19 (Hardening — error & trajectory capture)
**Target:** `src/program/program.ts`

## Capability
Thread the inner spoke's `AgentEvent` trajectory from `runTurn` through the
on-disk `Program` to a caller-provided sink.

## Changes (additive only)
1. Add `readonly onEvent?: (event: AgentEvent) => void` to `ProgramOptions`
   (import the `AgentEvent` type from `../agent/index.js`).
2. Store it as a `readonly #onEvent` field.
3. In `#buildOpts()`, pass `onEvent: this.#onEvent` into the returned
   `AgentOptions`.

When absent, `runTurn`'s `emit` is unchanged (it already guards
`if (opts.onEvent)`), so all existing tests pass unchanged.

## Acceptance
- `new Program({ ..., onEvent })` drives `runTurn` with `onEvent` set, so the
  sink receives every `AgentEvent` the turn emits.
- `new Program({ ... })` (no `onEvent`) is byte-for-byte unchanged.
- `npm test` + `npm run lint` green.
