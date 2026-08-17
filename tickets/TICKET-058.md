# TICKET-058 — Vitest coverage for the launcher

**Module:** `src/__tests__/launcher.test.ts`

## Capability
Deterministic vitest coverage for the process-level launcher.

## Behavior
Deterministic `FakeLlmAdapter` + built-in tools + a temp dir via `node:fs`
`mkdtempSync` in `os.tmpdir()`, a fixed `clock`, **no network / `Date.now()`**,
and **injected** `stdout`/`stderr` capture objects (never the real `process`
streams):
- (a) **`--help`** — `launch({ argv: ["--help"], stdout: cap, stderr: cap })`
  returns `0`, `cap.out` contains the usage line from `helpText()`, and **no**
  log file is written.
- (b) **`--version`** — `launch({ argv: ["--version"], ... })` returns `0` and
  `cap.out` contains the version string.
- (c) **a normal turn prints + exits 0** — `launch({ argv: ["hello"], adapter:
  <fake text turn>, logPath: <tmp>, ... })` returns `0`, `cap.out` contains the
  `formatResult` summary (the `completed` reason + the `logPath`), and a log
  file exists at `logPath`.
- (d) **an error turn exits 1** — a `FakeLlmAdapter` whose `complete` throws
  (so `runTurn` contains it into `end: "error"`) → `launch({ argv: ["boom"],
  adapter: <throwing fake>, ... })` returns `1` and `cap.out` reflects the
  `error` end reason.
- (e) **`formatResult` is pure** — two `ProgramResult`s with the same
  `end`/`turns`/`steps`/`logPath` produce identical strings, and the string
  contains the `end` reason and the `logPath`.
- (f) **`launch` honors `opts.argv`** — passing `argv: ["hi", "--id", "abc",
  "--session", p]` (with a fake) writes a log whose header `id === "abc"` at
  `p` (proving the launcher forwards `argv` to `main` and does not read
  `process.argv` when `opts.argv` is present).
- Clean up the temp dir in `afterEach`.

## Constraints
- Injectable streams keep it deterministic; tests never touch the real process
  streams.
- Every module has a vitest test before merge (Rule 4).
