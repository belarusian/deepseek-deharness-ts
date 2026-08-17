# TICKET-072 — E2E (c): error turn program run

**Module:** `src/__tests__/launcher.test.ts` (new `"E2E program run"` describe block)

## Capability
Assert the error-turn E2E path: a `FakeLlmAdapter` whose queue is exhausted
(throws on the first `complete`) drives `launch` to `end: "error"` and exit
code 1, while the log still records the `turn/end` with `reason: "error"`.

## Behavior
- Drive `launch` with an empty-queue `FakeLlmAdapter` (throws on first
  `complete`) + a temp `--session` path.
- Assert:
  - exit code `1`;
  - the printed summary reflects the error end;
  - the on-disk log records a `turn/end` event with `data.reason === "error"`.

## Constraints
- Deterministic and dependency-free; temp dir cleaned in `afterEach`.
- Drive the real `launch`; no subprocess spawn.
