# TICKET-088: `docs/CLI.md` does not document the provider-wiring flags or the fake/real adapter default

## Title
The CLI reference (`docs/CLI.md`) documents neither the (to-be-added)
`--api-key` / `--base-url` flags nor the fact that the adapter defaults to a
deterministic `FakeLlmAdapter` and switches to a real `DeepSeekLlmAdapter`
only when a key is present.

## Evidence
- `docs/CLI.md`, "Flags" table: lists `--session --id --resume --stream
  --max-steps --model --max-tokens --system --json --list --help --version`.
  No `--api-key`, no `--base-url`, no `DEEPSEEK_API_KEY` env note.
- `docs/CLI.md` has no section describing which adapter a turn is driven with
  (fake vs. real) or how a key selects the real one.
- `grep -n "api-key\|apiKey\|DeepSeek\|provider\|FakeLlm" docs/CLI.md` → no
  matches.
- `docs/ARCHITECTURE.md` likewise has no mention of the provider seam
  (`grep -n "api-key\|apiKey\|DeepSeek" docs/ARCHITECTURE.md` → no matches).

## Impact
A newcomer landing at the repo (the stated purpose of the docs) cannot learn
that the on-PATH command can talk to the real DeepSeek API, how to supply a
key, or that the default is a no-network fake. The documented surface and the
intended code surface (TICKET-085/086/087) would diverge.

## Suggestion
- Add `--api-key <key>` and `--base-url <url>` rows to the Flags table in
  `docs/CLI.md`, with defaults `DEEPSEEK_API_KEY` env / *(adapter default)*.
- Add a short "Adapter selection" section: no key → deterministic
  `FakeLlmAdapter`; key present (flag or `DEEPSEEK_API_KEY`) → real
  `DeepSeekLlmAdapter`.
- Note the precedence: `--api-key` > `DEEPSEEK_API_KEY`; `--base-url` >
  adapter default base URL.
