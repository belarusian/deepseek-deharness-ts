# TICKET-006: LLM message vocabulary (src/llm/message.ts)

**Cycle:** 4
**Priority:** P0
**Status:** open

## Description
Create the provider-neutral message vocabulary as plain TS types in `src/llm/message.ts`:
- `Role` = "system" | "user" | "assistant" | "tool"
- `TextBlock` = { type: "text"; text: string }
- `ToolCallBlock` = { type: "tool_call"; id: string; name: string; arguments: string }
- `ToolResultBlock` = { type: "tool_result"; toolCallId: string; content: string; isError?: boolean }
- `ContentBlock` = TextBlock | ToolCallBlock | ToolResultBlock
- `Message` = { role: Role; blocks: readonly ContentBlock[]; callId?: string; finishReason?: string }
- `AssistantMessage` = Message & { role: "assistant" }
- Construction helpers: `textBlock()`, `toolCallBlock()`, `toolResultBlock()`, `message()`, `assistantMessage()` — all return frozen objects

No DI, no branded types, no Cordis events. Plain types + frozen construction.

## Acceptance Criteria
- [ ] All types exported
- [ ] Construction helpers return `Object.freeze`d objects
- [ ] `assistantMessage()` narrows role to "assistant"
- [ ] No imports from session module (independent vocabulary)
