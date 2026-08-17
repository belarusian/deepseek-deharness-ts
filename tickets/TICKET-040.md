# TICKET-040 — Stream assembler: `assembleAssistant` (plain, total fold)

**Module:** `src/llm/assemble.ts` (new)

## Capability
A plain, total fold over an `LlmStream` that assembles an `AssistantMessage`.
Inverts the seed's stateful `BlockAssembler` into a single pure async function.

## Signature
```ts
export async function assembleAssistant(stream: LlmStream): Promise<AssistantMessage>
```

## Behavior (the fold)
Iterate the stream; for each yielded value:
- `text_delta` → concatenate `text` into a single accumulated text string.
- `tool_call_delta` → group by `id`: accumulate `name` from the first non-empty
  value; concatenate `arguments`. Track first-seen id order.
- `usage` → record token accounting (last one wins).
- `finish` → record the finish reason (last one wins).
- `StreamEnd` (detected by `"type" in value === false`) → record `finishReason`
  + `usage` (the end's values WIN over any mid-stream `finish`/`usage`) and stop.

## Output
Return a frozen `AssistantMessage` via the seam's `assistantMessage` builder:
- text block **first** (when any text was seen), then one `tool_call` block per
  id in first-seen order.
- `finishReason` from the end (or the last `finish` chunk if no end seen).

## Constraints
- Does NOT catch a stream that throws — let the throw propagate so the caller
  (`runTurn`) contains it into `end: "error"`.
- Pure fold: no DI, no state machine, no `ctx`.
- Reuse the seam's `assistantMessage` / `textBlock` / `toolCallBlock` builders.
