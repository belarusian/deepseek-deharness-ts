# TICKET-089: No test covers the fake/real adapter selection at the CLI/launcher seam

## Title
There is no `cli.test.ts`, and `launcher.test.ts` never exercises the
provider seam: nothing asserts that a present key selects a real
`DeepSeekLlmAdapter` while an absent key keeps the deterministic
`FakeLlmAdapter`.

## Evidence
- `ls src/__tests__/` → `launcher.test.ts`, `program.test.ts`,
  `deepseek.test.ts`, `integration.test.ts`, … but **no `cli.test.ts`**.
  `main` (the module that would own the fake/real selection) has no dedicated
  test file.
- `src/__tests__/launcher.test.ts`: every adapter is injected explicitly
  (e.g. `adapter: textAdapter("hi there")` at lines 118, 183, 203;
  `adapter: throwing` at 148, 225). No test omits the adapter to hit the
  default, and none supplies a key to assert a real adapter is composed.
- `grep -rn "apiKey\|base-url\|baseURL\|DEEPSEEK_API_KEY\|DeepSeekLlmAdapter"
  src/__tests__/cli.test.ts src/__tests__/launcher.test.ts` → no matches.

## Impact
The seam's core contract — "key present ⇒ real adapter, key absent ⇒ fake"
(TICKET-086) — is untested. A regression that always composes the fake (or
always the real, breaking the deterministic no-network default) would pass the
suite. The deterministic default is a load-bearing property of the on-PATH
program and currently has no guard.

## Suggestion
- Add `src/__tests__/cli.test.ts` covering `main`:
  - no key, no injected adapter → the turn is driven by the fake (assert the
    scripted `ok` text, no network).
  - key present (via `opts.apiKey` and via `--api-key` in argv) → a
    `DeepSeekLlmAdapter` is composed (assert via an injected `fetch` stub or by
    observing the request, offline).
  - `--base-url` overrides the adapter base URL.
  - `DEEPSEEK_API_KEY` env fallback selects the real adapter when no flag is
    given.
- Extend `launcher.test.ts` with a case that omits `adapter` and asserts the
  default path, and one that threads `apiKey` through `launch`.
