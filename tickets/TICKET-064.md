# TICKET-064 — Re-exports + vitest coverage (g-k) + gate

**Modules:** `src/program/index.ts`, `src/index.ts`, `src/__tests__/launcher.test.ts`

## Capability
Re-export the new launcher API and extend the launcher vitest coverage with the
`--json` / `--list` cases, then keep the full gate green.

## Behavior
- `src/program/index.ts`: add `formatResultJson` and `formatToolList` to the
  existing `export { launch, helpText, versionText, formatResult } from
  "./launcher.js";` line.
- `src/index.ts`: add `formatResultJson` and `formatToolList` to the existing
  launcher re-export block.
- `src/__tests__/launcher.test.ts`: keep cases a-f unchanged; add:
  - (g) **`--json` prints a parseable JSON summary + exits 0** — `launch({
    argv: ["hello", "--json", "--session", p], adapter: <fake text turn>,
    stdout: cap, stderr: cap })` returns `0`; `cap.out` is a single line that
    `JSON.parse`s to an object with `end === "completed"`, the right
    `turns`/`steps`, and `logPath === p`.
  - (h) **`--json` on an error turn exits 1** — a throwing fake → `launch({
    argv: ["boom", "--json", "--session", p], adapter: <throwing fake>, ... })`
    returns `1` and `JSON.parse(cap.out)` has `end === "error"`.
  - (i) **`--list` prints the registered tools + exits 0, no log** — `launch({
    argv: ["--list"], tools: <registry with echo+add>, stdout: cap, stderr:
    cap })` returns `0`, `cap.out` contains each tool's `name` and
    `description` (in `names()` order), and **no** log file is written.
  - (j) **`--list` with no `opts.tools` prints the built-ins** — `launch({
    argv: ["--list"], stdout: cap, stderr: cap })` returns `0` and `cap.out`
    contains the built-in tool names (`echo`, `add`, `fail`).
  - (k) **`formatResultJson` is pure** — two `ProgramResult`s with the same
    `end`/`turns`/`steps`/`logPath` produce identical strings, and `JSON.parse`
    of the string yields those fields.
  - Clean up the temp dir in `afterEach`.

## Constraints
- Gate: `npm run build` + `npm test` + `npm run lint` all pass.
- Keep the public API stable: `Program`, `main`, `runAgent`, `Conversation`,
  `toSessionEvent`, `launch`, `helpText`, `versionText`, `formatResult`, and
  all existing modules are unchanged in behavior; this cycle only *adds*
  `formatResultJson`/`formatToolList`, the `--json`/`--list` handling, and the
  re-exports. All 171 existing tests pass unchanged.
- Squash before merging (Rule 5).
