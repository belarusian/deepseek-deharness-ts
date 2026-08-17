/**
 * The provider-neutral **message vocabulary** of the LLM seam.
 *
 * Plain TypeScript types + immutable construction helpers. No DI, no branded
 * types, no Cordis event seams: a `Message` is a role plus a list of
 * `ContentBlock`s, and the blocks are a small discriminated union (text,
 * tool-call, tool-result). Downstream modules (session, agent loop) compose
 * this vocabulary by direct import.
 */

/** The model-visible roles. */
export type Role = "system" | "user" | "assistant" | "tool";

/** A plain text content block. */
export interface TextBlock {
  readonly type: "text";
  readonly text: string;
}

/** A tool invocation the model requested. */
export interface ToolCallBlock {
  readonly type: "tool_call";
  /** Stable id correlating this call to its {@link ToolResultBlock}. */
  readonly id: string;
  /** The tool's name. */
  readonly name: string;
  /** The tool's arguments, serialized as a JSON string. */
  readonly arguments: string;
}

/** The model-facing result of a completed tool call. */
export interface ToolResultBlock {
  readonly type: "tool_result";
  /** The {@link ToolCallBlock.id} this result answers. */
  readonly toolCallId: string;
  /** The tool's output (or error text). */
  readonly content: string;
  /** Present and `true` when the tool call failed. */
  readonly isError?: boolean;
}

/** The content-block union. */
export type ContentBlock = TextBlock | ToolCallBlock | ToolResultBlock;

/** A single message on the model-visible surface. */
export interface Message {
  readonly role: Role;
  readonly blocks: readonly ContentBlock[];
  /** Correlating id, when the message is tied to a tool call. */
  readonly callId?: string;
  /** Why the model stopped, when this is an assistant message. */
  readonly finishReason?: string;
}

/** An assistant-role message (one model step). */
export type AssistantMessage = Message & { readonly role: "assistant" };

// ── Immutable construction helpers ─────────────────────────────────────────
// Every helper returns a deeply-frozen object so callers cannot mutate shared
// vocabulary in place.

/** Build a frozen {@link TextBlock}. */
export function textBlock(text: string): TextBlock {
  return Object.freeze({ type: "text", text });
}

/** Build a frozen {@link ToolCallBlock}. */
export function toolCallBlock(
  id: string,
  name: string,
  args: string,
): ToolCallBlock {
  return Object.freeze({ type: "tool_call", id, name, arguments: args });
}

/** Build a frozen {@link ToolResultBlock}; `isError` is omitted when `undefined`. */
export function toolResultBlock(
  toolCallId: string,
  content: string,
  isError?: boolean,
): ToolResultBlock {
  return Object.freeze({
    type: "tool_result",
    toolCallId,
    content,
    ...(isError !== undefined ? { isError } : {}),
  });
}

/** Build a frozen {@link Message}; optional fields are omitted when `undefined`. */
export function message(
  role: Role,
  blocks: readonly ContentBlock[],
  callId?: string,
  finishReason?: string,
): Message {
  return Object.freeze({
    role,
    blocks: Object.freeze([...blocks]),
    ...(callId !== undefined ? { callId } : {}),
    ...(finishReason !== undefined ? { finishReason } : {}),
  });
}

/** Build a frozen {@link AssistantMessage} (role pinned to `"assistant"`). */
export function assistantMessage(
  blocks: readonly ContentBlock[],
  finishReason?: string,
): AssistantMessage {
  return Object.freeze({
    role: "assistant",
    blocks: Object.freeze([...blocks]),
    ...(finishReason !== undefined ? { finishReason } : {}),
  });
}
