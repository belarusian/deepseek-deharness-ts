/**
 * Public API of the LLM seam.
 *
 * Re-exported so downstream modules compose the message/stream/adapter/fake
 * vocabulary by direct import.
 */

export {
  textBlock,
  toolCallBlock,
  toolResultBlock,
  message,
  assistantMessage,
  type Role,
  type TextBlock,
  type ToolCallBlock,
  type ToolResultBlock,
  type ContentBlock,
  type Message,
  type AssistantMessage,
} from "./message.js";

export {
  textDelta,
  toolCallDelta,
  usageInfo,
  finishChunk,
  streamEnd,
  makeLlmStream,
  type TextDelta,
  type ToolCallDelta,
  type UsageInfo,
  type FinishChunk,
  type StreamChunk,
  type StreamUsage,
  type StreamEnd,
  type LlmStream,
} from "./stream.js";

export {
  LlmFailure,
  type ToolDefinition,
  type CallOptions,
  type LlmAdapter,
} from "./adapter.js";

export {
  FakeLlmAdapter,
  type ScriptedResponse,
} from "./fake.js";

export {
  withRetry,
  type RetryOptions,
} from "./retry.js";
