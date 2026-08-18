# TICKET-086: `main` always composes `FakeLlmAdapter`; never a real `DeepSeekLlmAdapter`

## Title
The CLI's `main` resolves the adapter as `opts?.adapter ?? defaultAdapter()`,
where `defaultAdapter()` is always a `FakeLlmAdapter`. There is no code path
that composes a real `DeepSeekLlmAdapter` when an API key is present.

## Evidence
- `src/program/cli.ts`, `defaultAdapter()` (~line 130): returns
  `new FakeLlmAdapter([{ message: assistantMessage([textBlock("ok")], "stop") }])`.
  This is the only adapter the CLI ever builds.
- `src/program/cli.ts`, `main` (~line 150): `const adapter = opts?.adapter ??
  defaultAdapter();`. The adapter is either caller-injected or the fake. There
  is no branch that inspects a key and builds a `DeepSeekLlmAdapter`.
- `src/llm/deepseek/adapter.ts`, `DeepSeekLlmAdapter` + `DeepSeekAdapterConfig`
  (~line 30): the real adapter exists and is exported from
  `src/llm/deepseek/index.ts`, but nothing in `src/program/` imports it.
  `grep -rn "DeepSeekLlmAdapter" src/program/` → no matches.

## Impact
Even if `--api-key` were parsed (TICKET-085), the key would have nowhere to go:
`main` has no logic to turn a key into a `DeepSeekLlmAdapter`. The on-PATH
program is hard-wired to the deterministic fake and can never make a real
network call.

## Suggestion
In `main`, after resolving `apiKey`/`baseUrl`/`model`:
- If `opts?.adapter` is provided, use it (preserve current injection).
- Else if a resolved `apiKey` is present, compose
  `new DeepSeekLlmAdapter({ apiKey, model: model ?? "deepseek-chat",
  baseURL: baseUrl })`.
- Else fall back to `defaultAdapter()` (the fake), preserving the deterministic
  no-network default.
Import `DeepSeekLlmAdapter` from `../llm/deepseek/index.js`.
