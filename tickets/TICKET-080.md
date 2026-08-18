# TICKET-080 — README.md (the user-facing entrypoint)

**Cycle 20** (Hardening, final). **Type:** docs (new file).

## What
Create `README.md` at the repo root — the user-facing entrypoint.

## Contents
1. **What it is:** the inversion of `deepseek-harness` + `cordis` — everything is a
   Program (agent loop + tools + session + llm-adapter as on-disk TS modules with
   clean APIs that compose directly), no plugin tree / DI / profiles / bundles /
   patches; organized by the four algebra (inner spoke = work + trajectory,
   outer spoke = append-only log).
2. **Install:** `npm install` (dev) and `npm link` to put the `deepseek` bin on PATH.
3. **Quick start:** real CLI examples (a text turn, a tool round-trip, `--json`,
   `--list`, `--stream`, `--max-steps`, `--model`/`--max-tokens`, `--resume`).
4. **CLI flag table:** every flag, matching `parseArgv`.
5. **Output formats:** the text summary (`completed turns=1 steps=2 log=<path>`)
   and `--json` (`{ end, turns, steps, logPath }`); exit codes (`0` for
   `completed`/`max_steps`, `1` for `error`/`aborted`).
6. **Programmatic seam:** `launch(opts?)` / `main(argv, opts?)` / `new Program(opts)`
   and the additive `onEvent` trajectory sink.
7. **Architecture overview:** link to `docs/ARCHITECTURE.md` + `docs/CLI.md`.
8. **Testing:** `npm test` (192 tests), `npm run build`, `npm run lint`.
9. **License:** MIT.

## Acceptance
- `README.md` exists at the root.
- The flag table matches `parseArgv` (includes `--model` and `--max-tokens`).
- No code change; all 192 tests pass unchanged.
