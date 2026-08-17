# TICKET-053 — Vitest coverage for the on-disk Program + CLI

**Module:** `src/__tests__/program.test.ts`

## Capability
Deterministic vitest coverage (a `FakeLlmAdapter` + built-in tools + a temp dir
via `node:fs` `mkdtempSync` in `os.tmpdir()`, a fixed `clock`, no
network/`Date.now()`).

## Cases
- **(a) run persists the log** — a text-only turn → `run` returns
  `result.end === "completed"` and a file exists at `logPath`; `readLog(logPath)`
  has a well-formed header (`id === sessionId`, `version === SESSION_FORMAT_VERSION`)
  and its events are `[turn/start, step/start, assistant/message, turn/end]` with
  contiguous `seq` (0,1,2,3).
- **(b) resume continues with contiguous seq** — after (a), `await program.resume()`
  then a second text-only turn → `readLog(logPath)` now has 8 events with `seq`
  0..7 (the first 4 preserved, the next 4 appended), and the header `id` is
  unchanged.
- **(c) resume seeds the transcript** — a `maxSteps:1` always-tool-call turn on a
  fresh program, then `resume()` + a text-only turn: the resumed turn's
  `assistant/message` reflects that the prior tool round-trip is in the transcript
  (assert the second turn's `assistant/message` `content` is the scripted text, and
  the log shows the tool/call + tool/result from turn 1 followed by turn 2's
  events).
- **(d) CLI main runs a turn** — `main(["hello"], { adapter: <fake>, logPath: <tmp> })`
  returns a `ProgramResult` with `result.end === "completed"` and writes the log.
- **(e) CLI flags parse** — `main(["hi", "--session", p, "--id", "abc", "--max-steps", "2"],
  { adapter: <fake> })` → the written log's header `id === "abc"` and the turn
  respects `maxSteps` (a `maxSteps:2` always-tool-call script ends `max_steps`).
- **(f) CLI resume** — `main(["one"], { adapter: <fake>, logPath: p })` then
  `main(["two", "--resume"], { adapter: <fake>, logPath: p })` → the log has both
  turns (8 events, contiguous `seq`).

## Constraints
- Clean up the temp dir in `afterEach`/`afterAll`.
- Every module has a vitest test before merge (Rule 4).
