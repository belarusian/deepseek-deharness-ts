# TICKET-095: LauncherOptions is missing the documented flag members

**Cycle:** 25
**File:** `src/program/launcher.ts`

`launch()` documents a full flag set in `helpText()` (`--session`, `--id`,
`--resume`, `--stream`, `--max-steps`, `--system`, `--model`, `--max-tokens`),
and `main`'s `parseArgv` parses and honors all of them. But `LauncherOptions`
is missing the corresponding optional members, so an `opts`-only caller (no
matching argv flag) is silently dropped.

**Fix:** add to `LauncherOptions` (all `readonly`, all optional, mirroring
`CliOptions` names): `sessionId?`, `logPath?`, `resume?`, `stream?`,
`maxSteps?`, `system?`, `model?`, `maxTokens?`. Keep the existing
`adapter`/`tools`/`json`/`stdout`/`stderr`/`onEvent`/`apiKey`/`baseURL`/
`temperature` members exactly as they are.
