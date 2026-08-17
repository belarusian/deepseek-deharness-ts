# TICKET-063 — `main`/`parseArgv`: recognize `--list` and `--json` as flags

**Module:** `src/program/cli.ts`

## Capability
Teach the pure `main` about `--list` and `--json` so the launcher can forward
them without re-parsing, and so a bare `--list` does not become the user
message.

## Behavior
- Extend `CliOptions` with `readonly json?: boolean` and `readonly list?:
  boolean`.
- In `parseArgv`, recognize `--list` (sets `list`) and `--json` (sets `json`)
  as flags that take **no value** (so they are not swallowed as user text).
- `main` returns the `ProgramResult` as before; the `list`/`json` flags are
  carried in the parsed shape. The launcher reads the flags from `argv`/`opts`
  directly (it already has both), NOT from a new return field — `main`'s return
  type stays `ProgramResult`.

## Constraints
- `main`'s return type is unchanged (`ProgramResult`).
- `--model`/`--max-tokens` are DEFERRED to cycle 17.
- All existing flag parsing (`--session`/`--id`/`--resume`/`--stream`/
  `--max-steps`/`--system`) is unchanged.
