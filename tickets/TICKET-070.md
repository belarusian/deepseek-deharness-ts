# TICKET-070 — E2E (a): multi-turn tool session end to end through `launch`

**Module:** `src/__tests__/launcher.test.ts` (new `"E2E program run"` describe block)

## Capability
Add a deterministic E2E test that drives the **real** `launch` (the same
entrypoint the on-PATH `bin` shim calls) through a multi-turn, tool-using
session and asserts the full trajectory: the on-disk log, the printed output,
the exit code, and the adapter `CallOptions`.

## Behavior
- Drive `launch` with a `FakeLlmAdapter` scripted to a tool round-trip (step 1:
  assistant requests `add` via a `tool_call` block; step 2: assistant answers
  with a text block) + the built-in tools + a temp `--session` path +
  `--model m1 --max-tokens 42`.
- Assert:
  - exit code `0`;
  - the printed output (captured via `opts.stdout`) is the one-line
    `formatResult` summary (`completed turns=1 steps=2 log=<logPath>`);
  - the on-disk log at the path is well-formed: header id/version, contiguous
    `seq` (`0..n-1`), and the expected event types in order —
    `turn/start, step/start, assistant/message, tool/call, tool/result,
    step/start, assistant/message, turn/end` (incl. `tool/call` +
    `tool/result`);
  - the fake's recorded `CallOptions` (both steps) has `model === "m1"` and
    `maxTokens === 42`.
- Keep all existing `launch` cases unchanged.

## Constraints
- Deterministic and dependency-free: `FakeLlmAdapter` + built-in tools + a temp
  dir (`node:fs` `mkdtempSync` in `os.tmpdir()`) + the CLI's default `() => 0`
  clock. No network, no `Date.now()`. Clean up the temp dir in `afterEach`.
- Drive the real `launch`, not a hand-built `Program`. No subprocess spawn.
