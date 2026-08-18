# TICKET-076 — Thread `onEvent` through `main` (the pure CLI)

**Cycle:** 19 (Hardening — error & trajectory capture)
**Target:** `src/program/cli.ts`

## Capability
Thread the `onEvent` sink from the CLI options to the composed `Program`.

## Changes (additive only)
1. Add `readonly onEvent?: (event: AgentEvent) => void` to `CliOptions`
   (import the `AgentEvent` type from `../agent/index.js`).
2. In `main`, pass `onEvent: opts?.onEvent` into `new Program({ ..., onEvent })`.

## Acceptance
- `main(argv, { onEvent })` composes a `Program` that forwards `onEvent` to
  `runTurn`.
- `main(argv)` (no `onEvent`) is unchanged.
- `npm test` + `npm run lint` green.
