# TICKET-083 — complete the `--help` block (the one code change)

**Cycle 20** (Hardening, final). **Type:** code fix (additive).

## What
`helpText()` in `src/program/launcher.ts` lists the flags but omits
`--model <name>` and `--max-tokens <n>` — both are parsed by `parseArgv`
(cycle 17) and threaded to the adapter, but are absent from the `--help` block.

## Fix
Add the two missing flag lines to `helpText()`:

    --model <name>     the model name threaded to the adapter call
    --max-tokens <n>   the max-tokens cap threaded to the adapter call

placed with the other value flags (after `--max-steps`, before `--system`),
keeping the exact format/alignment of the existing lines. `parseArgv` already
handles both flags; this only makes `--help` honest.

## Acceptance
- `helpText()` includes both new flag lines.
- Existing launcher tests still pass (they compare against the *returned*
  `helpText()`, not a hardcoded string): `toContain(helpText())`,
  `toContain("usage: deepseek")`, `toContain("deepseek-deharness-ts 0.1.0")`.
- No behavior change; all 192 tests pass unchanged.
