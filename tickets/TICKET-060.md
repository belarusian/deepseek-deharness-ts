# TICKET-060 — `formatResultJson`: a pure, deterministic JSON summary

**Module:** `src/program/launcher.ts`

## Capability
A **pure, deterministic** JSON rendering of a settled turn, for the `--json`
output mode.

## Behavior
- `export function formatResultJson(result: ProgramResult): string` returns
  `JSON.stringify` of a **fixed-shape object literal** with **stable key
  order**: `{ "end": <end>, "turns": <turns>, "steps": <steps>, "logPath":
  <logPath> }`.
- `end`/`turns`/`steps` come from `result.result`; `logPath` from
  `result.logPath`.
- The output is a single line, parseable by `JSON.parse`, and identical for
  two `ProgramResult`s with the same `end`/`turns`/`steps`/`logPath`.
- Pure: no I/O, no clock, no side effects.

## Constraints
- Does not change `formatResult` (the one-line summary stays as-is).
- The exit-code mapping is unchanged; this only changes the *format* of the
  printed summary when `--json` is selected.
