# TICKET-048 — `assistant/message` `usage?` is unreachable: the LLM seam drops usage before the `AgentEvent`

**Module:** `src/agent/trajectory.ts` (new) + `src/agent/types.ts` (AgentEvent) + `src/llm/assemble.ts`
**Cycle:** 13 (agent loop composes the session log)

## Capability
The `SessionEventMap["assistant/message"]` payload (`src/session/event.ts:93-98`)
carries an optional `usage?: TokenUsage` (`src/session/event.ts:68-72`). But the
`AgentEvent.assistant` variant (`src/agent/types.ts:54`) carries only
`message: AssistantMessage` — **no usage field** — and the LLM seam's
`AssistantMessage` (`src/llm/message.ts:56`) carries **no usage field either**.
The usage is folded (recorded) by the stream assembler but then **dropped**, so
it never reaches the `AgentEvent`, and therefore `toSessionEvent` can never
populate the session log's `usage?`.

## Evidence
- `src/session/event.ts:93-98` — `assistant/message` data has `usage?: TokenUsage`.
- `src/session/event.ts:68-72` — `TokenUsage = { promptTokens; completionTokens; totalTokens }`.
- `src/agent/types.ts:54` — `AgentEvent.assistant = { turn; step; message: AssistantMessage }`.
  No `usage` field.
- `src/llm/message.ts:56` — `AssistantMessage = Message & { role: "assistant" }`;
  `Message` (`:46-53`) has `role`, `blocks`, `callId?`, `finishReason?` — **no usage**.
- `src/llm/assemble.ts:75-78` — the assembler's `case "usage"` records the
  accounting but the comment states it is "folded (recorded) but not surfaced:
  the seam's `AssistantMessage` carries no usage field." The returned
  `AssistantMessage` has no usage.
- `src/llm/stream.ts:48` — the `StreamEnd` chunk **does** carry `usage?: StreamUsage`,
  so the data exists at the stream level; it is dropped at the `AssistantMessage`
  boundary.
- Reference fold shape (semantics only, never copy):
  `deepseek-harness/packages/core/agent-loop/src/agent.ts:381-389` appends
  `assistant/message` with `usage` from the assembler's `assembler.usage`, so the
  reference **does** surface usage into the session log.

## Impact
The session log's `assistant/message` `usage?` field is **always absent** in the
deharness fold: the token accounting is computed by the adapter and the stream
assembler, then discarded before it can reach the `AgentEvent`. The durable log
cannot record token usage, so any downstream consumer that reads `usage` from the
log (cost accounting, rate limiting, observability) gets nothing. This is a
silent, permanent data loss — not a bug that throws, but a capability the log
schema promises (`usage?` is in the type) that the fold can never deliver.

## Suggestion
This is a **design decision** that must be made explicitly, not discovered by
type-error. Two options:
- **Option A (thread usage through):** add `usage?: TokenUsage` to
  `AgentEvent.assistant` (`src/agent/types.ts:54`), and have `runTurn`
  (`src/agent/turn.ts:112-122`) capture the usage from the adapter result and
  include it in the emitted `assistant` event. This requires the LLM seam to
  surface usage on the `AssistantMessage` (or a sibling return value), which
  means changing `src/llm/message.ts` and `src/llm/assemble.ts` — a larger
  change that touches the LLM seam's public types.
- **Option B (accept the gap):** document that the deharness fold does **not**
  populate `usage?` (the LLM seam drops it), and either (a) leave `usage?` in
  the session schema as a forward-looking field that is always absent, or (b)
  remove `usage?` from `SessionEventMap["assistant/message"]` to avoid
  promising a field the fold can never deliver.
- **Recommendation:** Option B(a) — leave `usage?` in the schema (it is
  merge-extensible by design, `src/session/event.ts:77-79`) and document in the
  `trajectory.ts` module docstring that `toSessionEvent` does not populate
  `usage?` because the LLM seam's `AssistantMessage` carries no usage. This
  keeps the change local to the agent module and does not require touching the
  LLM seam's public types. If usage becomes a hard requirement later, Option A
  can be implemented as a follow-up ticket.
- Whichever option is chosen, the decision must be **documented** in the
  `trajectory.ts` module docstring so the "plain, total mapping" claim is
  scoped and the usage gap is named.

## Acceptance
- The `usage?` gap is explicitly documented (not left implicit).
- If Option B(a): `toSessionEvent` does not populate `usage?`, and the
  `trajectory.ts` docstring states why.
- If Option A: `AgentEvent.assistant` carries `usage?`, `runTurn` captures it,
  and `toSessionEvent` maps it. The LLM seam change is a separate ticket.
- The existing 6 agent.test.ts + 7 conversation.test.ts cases pass UNCHANGED
  (they do not assert on usage).
