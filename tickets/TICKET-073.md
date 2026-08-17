# TICKET-073 — E2E (d): resume program run (two `launch` calls)

**Module:** `src/__tests__/launcher.test.ts` (new `"E2E program run"` describe block)

## Capability
Assert the resume E2E path: two `launch` calls (the second with `--resume`)
produce an on-disk log with contiguous `seq` across both turns and an
unchanged header id.

## Behavior
- First `launch`: a text `FakeLlmAdapter` + a temp `--session` path + `--id
  <id>` → writes a 4-event log (`turn/start, step/start, assistant/message,
  turn/end`), seq `0..3`.
- Second `launch`: a text `FakeLlmAdapter` + the same `--session` path +
  `--id <id>` + `--resume` → reads the log, seeds a fresh `SessionLog`, runs a
  new turn, and rewrites the log.
- Assert:
  - both exit codes `0`;
  - the on-disk log has 8 events with contiguous `seq` (`0..7`) across both
    turns;
  - the header id is unchanged (equals `<id>`);
  - the second turn's events carry `turn: 1` (each `launch` is a fresh
    `Program`/turn; contiguity is on `seq`, not `turn`).

## Constraints
- Deterministic and dependency-free; temp dir cleaned in `afterEach`.
- Drive the real `launch`; no subprocess spawn.
