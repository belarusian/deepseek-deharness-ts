# TICKET-071 — E2E (b): `--json` program run

**Module:** `src/__tests__/launcher.test.ts` (new `"E2E program run"` describe block)

## Capability
Assert the `--json` E2E path: the same tool-using session driven with `--json`
prints a parseable JSON summary and exits 0.

## Behavior
- Drive `launch` with the same multi-turn tool session as TICKET-070 but with
  `--json` in `argv`.
- Assert:
  - exit code `0`;
  - the printed output `JSON.parse`s to `{ end: "completed", turns, steps,
    logPath }` with the expected `turns`/`steps`/`logPath`;
  - the on-disk log is still written and well-formed.

## Constraints
- Deterministic and dependency-free; temp dir cleaned in `afterEach`.
- Drive the real `launch`; no subprocess spawn.
