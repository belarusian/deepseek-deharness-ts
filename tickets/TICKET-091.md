# TICKET-091: `main` does not thread `temperature` into `callOptions`

## Title
`main` builds `callOptions` only from `model` / `maxTokens`; a resolved
`temperature` is dropped, so even a programmatic `opts.temperature` never reaches
the adapter.

## Evidence
- `src/program/cli.ts`, `main`:
  `const callOptions: CallOptions | undefined = model !== undefined ||
  maxTokens !== undefined ? { model, maxTokens } : undefined;`
  `temperature` is neither resolved nor included.
- `src/llm/fake.ts`, `FakeLlmAdapter`: records `CallOptions` on every
  `complete`/`stream` (`lastCallOptions`), so the passthrough is assertable
  offline.

## Impact
`temperature` cannot be threaded to the adapter call from `main` at all, whether
via `argv` or `opts`.

## Suggestion
- Resolve `const temperature = parsed.temperature ?? opts?.temperature;`.
- Build `callOptions` when **any** of `model` / `maxTokens` / `temperature` is
  present, and include `temperature` when it is:
  `{ model, maxTokens, temperature }`. When none is present, keep it
  `undefined` (byte-for-byte the same as today, so no existing test changes).
