# TICKET-043 — Re-export `assembleAssistant` (barrels)

**Modules:** `src/llm/index.ts`, `src/index.ts`

## Capability
Expose the new stream assembler in the public API.

## Change
- `src/llm/index.ts`: add `assembleAssistant` to the stream re-export block
  (alongside `textDelta`/`toolCallDelta`/`usageInfo`/`finishChunk`/`streamEnd`/
  `makeLlmStream`).
- `src/index.ts`: add `assembleAssistant` to the LLM stream re-export block.

## Constraints
- No new name collisions (verify `assembleAssistant` is not already exported).
- `AssistantMessage` stays NOT re-exported at the top level (session collision).
