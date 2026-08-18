# TICKET-090: `parseArgv` / `CliOptions` have no `--temperature` flag

## Title
The on-PATH CLI cannot set the sampling temperature: `parseArgv` and
`CliOptions` expose no `--temperature` flag, even though `CallOptions.temperature`
already exists and the DeepSeek serializer already sends it on the wire.

## Evidence
- `src/program/cli.ts`, `ParsedArgv` (interface): fields are
  `userText, sessionId, logPath, resume, stream, maxSteps, system, json, list,
  model, maxTokens, apiKey, baseURL`. No `temperature`.
- `src/program/cli.ts`, `parseArgv`: the flag ladder handles `--session --id
  --resume --stream --max-steps --system --json --list --model --max-tokens
  --api-key --base-url`. There is no branch for `--temperature`, so it would be
  swallowed as `userText` (the `else if (userText === undefined)` catch-all).
- `src/program/cli.ts`, `CliOptions`: no `temperature` member.
- `src/llm/adapter.ts`, `CallOptions`: `temperature?: number` already present.
- `src/llm/deepseek/serialize.ts`, `serializeRequest`:
  `if (opts?.temperature !== undefined) req.temperature = opts.temperature;`
  already sends it on the wire.

## Impact
A user cannot set the sampling temperature from the command line. The value is
a first-class `CallOptions` member and is already serialized, but the CLI
surface (the thing on `$PATH`) has no entry point for it.

## Suggestion
- Add `temperature?: number` to `ParsedArgv` and to `CliOptions`.
- In `parseArgv`, add a `--temperature <n>` value-flag branch (mirroring
  `--max-tokens`, parsed with `Number(argv[++i])`), so it is consumed before the
  `userText` catch-all.
