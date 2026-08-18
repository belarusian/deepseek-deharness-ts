# TICKET-082 — package.json release metadata + CHANGELOG.md

**Cycle 20** (Hardening, final). **Type:** release metadata (new + edit).

## What
1. Make `package.json` publishable (add release metadata; keep the rest unchanged).
2. Create `CHANGELOG.md`.

## package.json — ADD
- `description` (one line: the inversion of deepseek-harness + cordis as plain,
  composable TS modules)
- `license` `MIT`
- `repository` `{ type: git, url: https://github.com/belarusian/deepseek-deharness-ts.git }`
- `keywords` (e.g. `deepseek`, `agent`, `llm`, `cli`, `session`, `tools`)
- `files` `["dist"]`
- `engines` `{ node: ">=20" }`
- `publishConfig` `{ access: public }`

## package.json — KEEP UNCHANGED
`name`, `version` `0.1.0` (do NOT bump), `type`, `bin`, `scripts`, `devDependencies`.

## CHANGELOG.md
An `## 0.1.0` entry (the initial release) summarizing the six phases and their
key capabilities: Foundations (append-only session log), LLM seam (message/stream
vocabulary + adapter interface + fake + DeepSeek HTTP adapter + retry), Tools
(registry + guarded execution pipeline + JSON-Schema validation + `defineTool` +
built-ins), Agent loop (step/turn driver + multi-turn `Conversation` + streaming +
the `toSessionEvent` fold), Four-algebra composition (on-disk `Program` +
process-level launcher + PATH wiring + `--json`/`--list` + `--model`/`--max-tokens`),
and Hardening (E2E program run + the `onEvent` trajectory seam +
streaming/step-budget/error E2E + docs + release).

## Acceptance
- `package.json` valid JSON; `version` still `0.1.0`; `npm run build`/`test`/`lint` green.
- `CHANGELOG.md` exists with the `## 0.1.0` entry.
