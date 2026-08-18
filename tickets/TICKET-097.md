# TICKET-097: No test covers launch() flag passthrough (the launcher gap)

**Cycle:** 25
**File:** `src/__tests__/launcher.test.ts`

There is no test proving `launch()` threads the documented flags
(`--system`, `--session`, `--id`, `--resume`, `--stream`, `--max-steps`,
`--model`, `--max-tokens`) and the `opts`-only fallback path through to
`main`.

**Fix:** add a focused `launch passthrough` describe block, all offline via an
injected `FakeLlmAdapter` + injectable `stdout`/`stderr` + a temp `logPath`.
Cover: each flag threaded; the `opts`-only fallback (no matching argv flag);
argv flag wins over `opts`; and the no-`opts` regression (none of
model/maxTokens/temperature threaded).
