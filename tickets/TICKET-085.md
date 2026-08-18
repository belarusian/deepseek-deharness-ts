# TICKET-085: `parseArgv` / `CliOptions` have no `--api-key` / `--base-url` flags

## Title
The on-PATH CLI cannot accept a provider key or endpoint: `parseArgv` and
`CliOptions` expose no `--api-key` / `--base-url` flags, and there is no
`DEEPSEEK_API_KEY` environment fallback.

## Evidence
- `src/program/cli.ts`, `ParsedArgv` (interface, ~line 44): fields are
  `userText, sessionId, logPath, resume, stream, maxSteps, system, json, list,
  model, maxTokens`. No `apiKey`, no `baseUrl`.
- `src/program/cli.ts`, `parseArgv` (~line 78): the flag ladder handles
  `--session --id --resume --stream --max-steps --system --json --list --model
  --max-tokens`. There is no branch for `--api-key` or `--base-url`, so both
  would be swallowed as `userText` (the `else if (userText === undefined)`
  catch-all).
- `src/program/cli.ts`, `CliOptions` (~line 33): no `apiKey` / `baseUrl` members.
- `grep -rn "DEEPSEEK_API_KEY" src/` → no matches. No env fallback exists.

## Impact
A user cannot point the on-PATH `deepseek` command at the real DeepSeek API.
The only way to drive a real adapter is to import `main`/`launch` and inject an
`adapter` object programmatically; the CLI surface (the thing on `$PATH`) has
no key/endpoint entry point at all.

## Suggestion
- Add `apiKey?: string` and `baseUrl?: string` to `ParsedArgv` and to
  `CliOptions`.
- In `parseArgv`, add `--api-key <key>` and `--base-url <url>` value-flag
  branches (mirroring `--model`), so they are consumed before the `userText`
  catch-all.
- Resolve the key as `argv --api-key` > `opts.apiKey` > `process.env.DEEPSEEK_API_KEY`.
  Resolve the base URL as `argv --base-url` > `opts.baseUrl` (no env fallback
  needed; the adapter already defaults its base URL).
