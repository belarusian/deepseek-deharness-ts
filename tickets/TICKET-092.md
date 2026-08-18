# TICKET-092: `LauncherOptions` / `launch` / `helpText` have no `--temperature`

## Title
The process-level launcher cannot accept a temperature: `LauncherOptions` has no
`temperature` member, `launch` does not thread it into `main`, and `helpText()`
does not document the flag.

## Evidence
- `src/program/launcher.ts`, `LauncherOptions`: members are `argv, adapter,
  tools, json, stdout, stderr, onEvent, apiKey, baseURL`. No `temperature`.
- `src/program/launcher.ts`, `launch`: the `main(argv, { ... })` call threads
  `adapter, tools, onEvent, apiKey, baseURL` — not `temperature`.
- `src/program/launcher.ts`, `helpText()`: the flag list has `--model`,
  `--max-tokens`, `--api-key`, `--base-url` — no `--temperature`.

## Impact
The on-PATH `deepseek` command (driven through `launch`) has no way to set the
sampling temperature, and `--help` does not advertise it.

## Suggestion
- Add `readonly temperature?: number` to `LauncherOptions`.
- Thread `temperature: opts?.temperature` into the `main(argv, { ... })` call.
- Add a `--temperature <n>` line to `helpText()` after `--max-tokens` and before
  `--api-key`, matching the existing alignment.
