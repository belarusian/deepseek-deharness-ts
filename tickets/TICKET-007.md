# TICKET-007: LLM stream vocabulary (src/llm/stream.ts)

**Cycle:** 4
**Priority:** P0
**Status:** open

## Description
Create the stream vocabulary as plain TS types in `src/llm/stream.ts`:
- `TextDelta` = { type: "text_delta"; text: string }
- `ToolCallDelta` = { type: "tool_call_delta"; id: string; name: string; arguments: string }
- `UsageInfo` = { type: "usage"; promptTokens: number; completionTokens: number }
- `FinishChunk` = { type: "finish"; reason: string }
- `StreamChunk` = TextDelta | ToolCallDelta | UsageInfo | FinishChunk
- `StreamEnd` = { finishReason: string; usage?: { promptTokens: number; completionTokens: number } }
- `LlmStream` = { [Symbol.asyncIterator](): AsyncIterator<StreamChunk | StreamEnd> }

Plain types. The stream is an async iterable that yields chunks and ends with a StreamEnd.

## Acceptance Criteria
- [ ] All types exported
- [ ] `LlmStream` is an async iterable interface
- [ ] `StreamEnd` carries finish reason + optional usage
