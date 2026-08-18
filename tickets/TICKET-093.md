# TICKET-093: no vitest coverage for the `--temperature` seam

## Title
There is no test proving `--temperature` is parsed, threaded through `main` and
`launch`, and reaches the adapter `CallOptions` — and no regression test that the
no-flag path is unchanged.

## Evidence
- `src/__tests__/launcher.test.ts` and `src/__tests__/provider.test.ts` cover
  `--model` / `--max-tokens` / `--api-key` / `--base-url` but not `--temperature`.
- `FakeLlmAdapter.lastCallOptions` records the `CallOptions` a turn is driven
  with, so the passthrough is assertable without any network.

## Impact
The new flag is unverified: nothing proves it is consumed as a value flag (not
swallowed as user text), threaded into `callOptions`, or that the no-flag path
still yields `callOptions === undefined`.

## Suggestion
- Add tests (offline, via an injected `FakeLlmAdapter`): `parseArgv` picks up
  `--temperature <n>`; `main` threads `temperature` into `callOptions`;
  `main` threads it alongside model/maxTokens; the no-flag regression keeps
  `lastCallOptions === undefined`; `opts.temperature` fallback and the flag
  winning over it; `helpText()` documents the flag; `launch` threads it.
