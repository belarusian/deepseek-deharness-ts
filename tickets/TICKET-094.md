# TICKET-094: docs do not document `--temperature` (and the README adapter note is missing)

## Title
`docs/CLI.md` and `README.md` do not list the `--temperature` flag, and the
README is missing the one-line note (requested in the cycle-23 briefing) that a
real `DeepSeekLlmAdapter` is selected when an API key is present and the
deterministic fake otherwise.

## Evidence
- `docs/CLI.md`, Flags table: lists `--model`, `--max-tokens`, `--api-key`,
  `--base-url` — no `--temperature`.
- `README.md`, "CLI flags" table: same gap.
- `README.md`: no note that a real `DeepSeekLlmAdapter` is selected when an API
  key is present (`--api-key` / `DEEPSEEK_API_KEY`) and the deterministic fake
  otherwise.

## Impact
The documented flag surface lags the implemented one; a user reading the docs
cannot discover `--temperature` or the real/fake adapter selection.

## Suggestion
- Add `--temperature <n>` to the flag table in `docs/CLI.md` (default *(none)*).
- Add `--temperature <n>` to the `README.md` CLI flag table, and add the
  one-line adapter-selection note. Keep both accurate; do not rewrite.
