/**
 * Barrel re-export for the DeepSeek wire-adapter module.
 *
 * @module llm/deepseek
 */

export type {
  WireMessage,
  WireToolCall,
  WireTool,
  WireRequest,
  WireChunk,
  WireChoice,
  WireDelta,
  WireToolCallDelta,
  WireUsage,
  WireError,
} from "./types.js";

export { serializeMessages, serializeRequest } from "./serialize.js";
export { parseSse, DONE } from "./sse.js";
export { translate } from "./translate.js";
export { DeepSeekLlmAdapter } from "./adapter.js";
export type { DeepSeekAdapterConfig } from "./adapter.js";
