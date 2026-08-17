# TICKET-067 — `--model` / `--max-tokens` flags in the pure CLI

**Module:** `src/program/cli.ts`

## Capability
Add `--model` / `--max-tokens` value flags to the pure CLI and build a
`callOptions` object (only when at least one is present) to pass to the
`Program`.

## Behavior
- Extend `CliOptions` with `readonly model?: string` and
  `readonly maxTokens?: number`.
- In `parseArgv`, recognize `--model <name>` (sets `model`) and
  `--max-tokens <n>` (sets `maxTokens`) as value flags (like `--max-steps`).
- In `main`, resolve `model = parsed.model ?? opts?.model` and
  `maxTokens = parsed.maxTokens ?? opts?.maxTokens`; build `callOptions` as
  `{ model, maxTokens }` **only when at least one is present** (so an absent
  `callOptions` keeps the adapter call identical to before), and pass
  `callOptions` into `new Program({ ..., callOptions })`.

## Constraints
- The launcher is unchanged: it already forwards `argv` to `main`; the new
  flags are parsed in `main`/`parseArgv` (cycle 14's home for flag parsing).
- `callOptions` is built in `main`, not `Program`.
- Additive only: with no flags and no `opts.model`/`opts.maxTokens`, the
  `Program` is constructed with no `callOptions` and the adapter call is
  unchanged.
