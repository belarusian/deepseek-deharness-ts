# Changelog

All notable changes to `deepseek-deharness-ts` are documented here.

## 0.1.0

The initial release. The inversion of `deepseek-harness` + `cordis`: everything
is a **Program** — the agent loop, tools, session log, and LLM adapter are
on-disk TypeScript modules with clean APIs that compose directly. No plugin
tree, no DI container, no profiles/bundles/patches. Organized by the four
algebra (inner spoke = work + trajectory, outer spoke = append-only log).

### Foundations
- The append-only session log: the `SessionEvent` vocabulary, the `SessionLog`
  (append / readAll / since / last), and the JSONL persistence seam (header
  line, one event per line, torn-tail recovery, version gate).

### LLM seam
- The provider-neutral message/stream vocabulary, the `LlmAdapter` interface,
  the `FakeLlmAdapter`, the DeepSeek HTTP wire adapter (serializer, SSE parser,
  translator), and the `withRetry` seam.

### Tools
- The `ToolRegistry`, the guarded execution pipeline, JSON-Schema argument
  validation, `defineTool`, and the built-ins (`echo`, `add`, `fail`).

### Agent loop
- The step/turn driver (`runTurn`), the multi-turn `Conversation`, the streaming
  seam, and the `toSessionEvent` fold (inner spoke → outer spoke).

### Four-algebra composition
- The on-disk `Program` (composes both spokes, owns the durable log, resume),
  the process-level launcher (`launch`), the on-PATH bin wiring, and the
  `--json` / `--list` / `--model` / `--max-tokens` flags.

### Hardening
- The E2E program run (the real `launch` → `main` → `Program` → `runTurn` →
  adapter on PATH), the additive `onEvent` trajectory seam, and E2E coverage
  for streaming, the step budget, and the error trajectory.
- User-facing docs (`README.md`, `docs/CLI.md`, the full-composition
  architecture section), release metadata, and a tag-driven release workflow
  (CI-verified, dry-run publish).
