# TICKET-062 — `launch`: `--list` interception + `--json` output mode

**Module:** `src/program/launcher.ts`

## Capability
Extend the process-level launcher with a `--list` short-circuit and a `--json`
output mode, keeping the launcher the ONLY place that reads `process.argv`,
prints, and returns an exit code.

## Behavior
- Add `readonly json?: boolean` to `LauncherOptions`.
- In `launch`, AFTER `--help`/`--version` and BEFORE `main`: if `argv` contains
  `--list` → write `formatToolList(tools)` to `stdout` (where
  `tools = opts?.tools ?? defaultTools()`, the SAME default the CLI uses) and
  **return 0** (no turn, no log).
- When running a turn: if `opts?.json === true` **or** `argv` contains `--json`
  → write `formatResultJson(result)` to `stdout` instead of
  `formatResult(result)`. The exit-code mapping is unchanged (`0` on
  `completed`/`max_steps`, `1` on `error`/`aborted`).
- Add `--json` and `--list` to the `helpText()` flag list.
- Keep `helpText()`/`versionText()`/`formatResult()` behavior otherwise as-is.

## Constraints
- The launcher still wraps the pure `main`; it does not re-compose. `--list`
  is intercepted BEFORE `main` and writes no log.
- `--json` changes only the output format, not the exit code.
- `--model`/`--max-tokens` are DEFERRED to cycle 17 (loop/adapter API
  untouched this cycle).
