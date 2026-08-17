# TICKET-008: LLM adapter interface (src/llm/adapter.ts)

**Cycle:** 4
**Priority:** P0
**Status:** open

## Description
Create the adapter interface in `src/llm/adapter.ts`:
- `ToolDefinition` = { name: string; description: string; parameters: Record<string, unknown> }
- `CallOptions` = { model?: string; maxTokens?: number; temperature?: number; tools?: readonly ToolDefinition[] }
- `LlmFailure` extends Error: { code: string; status?: number; retryAfterMs?: number }
- `LlmAdapter` interface:
  - `complete(messages: readonly Message[], opts?: CallOptions): Promise<AssistantMessage>`
  - `stream(messages: readonly Message[], opts?: CallOptions): LlmStream`

This is the seam the agent loop (cycles 10-13) calls directly. No DI, no registration.

## Acceptance Criteria
- [ ] `LlmAdapter` is a plain interface (not abstract class)
- [ ] `LlmFailure` extends Error with stable code
- [ ] `CallOptions` includes model, maxTokens, temperature, tools
- [ ] Imports from `./message.js` and `./stream.js`
