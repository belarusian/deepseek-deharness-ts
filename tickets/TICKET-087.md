# TICKET-087: `LauncherOptions` does not thread `apiKey` / `baseUrl` into `main`

## Title
The process-level launcher's `LauncherOptions` has no `apiKey` / `baseUrl`
members, and `launch` does not forward any key/endpoint to `main`, so the
provider seam cannot be driven programmatically through `launch` either.

## Evidence
- `src/program/launcher.ts`, `LauncherOptions` (~line 33): members are
  `argv, adapter, tools, json, stdout, stderr, onEvent`. No `apiKey`, no
  `baseUrl`.
- `src/program/launcher.ts`, `launch` (~line 150): the `main(argv, {...})`
  call forwards only `adapter: opts?.adapter`, `tools: opts?.tools`,
  `onEvent: opts?.onEvent`. No key/endpoint is passed, so even a caller who
  wanted to supply a key via `launch` has no field to set.
- `src/program/launcher.ts`, `helpText()` (~line 47): the flag list documents
  `--session --id --resume --stream --max-steps --model --max-tokens --system
  --json --list --help --version`. No `--api-key` / `--base-url` line.

## Impact
The launcher is the ONLY place that reads `process.argv` and is the documented
on-PATH entry (see `docs/CLI.md`). Because it neither exposes the flags in
help nor threads them to `main`, the real-adapter path is unreachable from the
process entry even after `main` is fixed (TICKET-086).

## Suggestion
- Add `apiKey?: string` and `baseUrl?: string` to `LauncherOptions`.
- In `launch`, forward them to `main`: `apiKey: opts?.apiKey,
  baseUrl: opts?.baseUrl` (alongside the existing `adapter`/`tools`/`onEvent`).
- Add `--api-key <key>` and `--base-url <url>` lines to `helpText()` so the
  documented flag surface matches the parsed surface.
