# TICKET-096: launch() does not forward the new opts values to main()

**Cycle:** 25
**File:** `src/program/launcher.ts`

`launch()` currently forwards only `adapter`/`tools`/`onEvent`/`apiKey`/
`baseURL`/`temperature` to `main(argv, { ... })`. The new `LauncherOptions`
members (TICKET-095) are never forwarded, so the `opts`-only path is dropped.

**Fix:** extend the `main(argv, { ... })` call to forward `sessionId`,
`logPath`, `resume`, `stream`, `maxSteps`, `system`, `model`, `maxTokens`
alongside the existing ones. Do NOT change `--json` handling, `--help`/
`--version`/`--list` interception, or the exit-code logic. When no `opts` value
is supplied the forwarded value is `undefined`, which `main` already treats as
absent (`argv flag > opts > default`), so the no-`opts` path is unchanged.
