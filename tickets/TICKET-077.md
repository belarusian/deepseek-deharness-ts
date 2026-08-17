# TICKET-077 — Thread `onEvent` through `launch` (the process launcher)

**Cycle:** 19 (Hardening — error & trajectory capture)
**Target:** `src/program/launcher.ts`

## Capability
Thread the `onEvent` sink from the launcher options to the pure `main`.

## Changes (additive only)
1. Add `readonly onEvent?: (event: AgentEvent) => void` to `LauncherOptions`
   (import the `AgentEvent` type from `../agent/index.js`).
2. In `launch`, pass `onEvent: opts?.onEvent` into
   `main(argv, { adapter, tools, onEvent })`.

## Acceptance
- `launch({ onEvent })` drives `main` with `onEvent` set, so the sink receives
  the inner-spoke `AgentEvent` stream for the turn.
- `launch({ ... })` (no `onEvent`) is unchanged.
- `npm test` + `npm run lint` green.
