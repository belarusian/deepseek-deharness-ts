/**
 * Wire types for the DeepSeek OpenAI-compatible chat-completions endpoint.
 *
 * Plain TypeScript interfaces describing the on-the-wire JSON shapes. No
 * runtime code, no branded types, no DI — just the vocabulary the serializer,
 * SSE parser, translator, and adapter share.
 *
 * @module llm/deepseek/types
 */

/** A single message on the wire, discriminated by `role`. */
export interface WireMessage {
  role: "system" | "user" | "assistant" | "tool";
  /** Text content. Always a string (tool-call-only assistant turns send `""`). */
  content: string;
  /** Present on assistant turns that requested tool calls. */
  tool_calls?: WireToolCall[];
  /** Present on `role: "tool"` messages; correlates to a tool call id. */
  tool_call_id?: string;
}

/** A completed tool call replayed on an assistant history message. */
export interface WireToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    /** Raw JSON string of the call arguments. */
    arguments: string;
  };
}

/** One entry of the request `tools` array. */
export interface WireTool {
  type: "function";
  function: {
    name: string;
    description: string;
    /** JSON-Schema-shaped parameter description. */
    parameters: Record<string, unknown>;
  };
}

/** The full request body for `POST {baseURL}/chat/completions`. */
export interface WireRequest {
  model: string;
  messages: WireMessage[];
  /** Always streaming. */
  stream: true;
  /** Ask the provider to report token usage in the final chunk. */
  stream_options: { include_usage: true };
  max_tokens?: number;
  temperature?: number;
  tools?: WireTool[];
}

/** One parsed SSE `data:` payload (a chat.completion.chunk). */
export interface WireChunk {
  id?: string;
  object?: string;
  created?: number;
  model?: string;
  choices?: WireChoice[];
  /** Arrives on the finish chunk and/or a trailing usage-only chunk. */
  usage?: WireUsage | null;
}

/** One streamed choice; `finish_reason` is non-null only on the terminal chunk. */
export interface WireChoice {
  index?: number;
  delta?: WireDelta;
  finish_reason?: string | null;
}

/** The incremental content of one streamed choice. */
export interface WireDelta {
  role?: string;
  /** Visible text; null/empty on tool-call-only chunks. */
  content?: string | null;
  tool_calls?: WireToolCallDelta[];
}

/** A streamed fragment of one tool call; fragments sharing `index` concatenate. */
export interface WireToolCallDelta {
  index: number;
  /** Present on the first delta of each call only. */
  id?: string;
  type?: string;
  function?: {
    /** Present on the first delta of each call only. */
    name?: string;
    /** Argument JSON fragment (concatenate across deltas). */
    arguments?: string;
  };
}

/** Wire token accounting. */
export interface WireUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens?: number;
}

/** Non-2xx error body. */
export interface WireError {
  error?: {
    message?: string;
    type?: string;
    code?: string;
  };
}
