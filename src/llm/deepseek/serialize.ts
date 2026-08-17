/**
 * Request serialization: flatten the provider-neutral {@link Message}
 * vocabulary into the DeepSeek wire format.
 *
 * - Text blocks are joined into a single `content` string.
 * - Assistant `tool_call` blocks become `tool_calls` on the wire message.
 * - Tool-call-only assistant turns send `content: ""` (never `null`).
 * - `tool_result` blocks become standalone `{ role: "tool" }` wire messages;
 *   empty output is rendered as `"(no output)"`.
 *
 * @module llm/deepseek/serialize
 */

import type { Message, ToolResultBlock } from "../message.js";
import type { CallOptions, ToolDefinition } from "../adapter.js";
import type { WireMessage, WireRequest, WireTool, WireToolCall } from "./types.js";

/**
 * Convert internal messages to wire messages, preserving order. Each
 * `tool_result` block is expanded into its own `role: "tool"` wire message.
 */
export function serializeMessages(messages: readonly Message[]): WireMessage[] {
  const out: WireMessage[] = [];

  for (const msg of messages) {
    const textParts: string[] = [];
    const toolCalls: WireToolCall[] = [];
    const toolResults: ToolResultBlock[] = [];

    for (const block of msg.blocks) {
      if (block.type === "text") {
        textParts.push(block.text);
      } else if (block.type === "tool_call") {
        toolCalls.push({
          id: block.id,
          type: "function",
          function: { name: block.name, arguments: block.arguments },
        });
      } else if (block.type === "tool_result") {
        toolResults.push(block);
      }
    }

    const content = textParts.join("");

    if (msg.role === "system") {
      out.push({ role: "system", content });
    } else if (msg.role === "assistant") {
      const wire: WireMessage = { role: "assistant", content };
      if (toolCalls.length > 0) wire.tool_calls = toolCalls;
      out.push(wire);
    } else {
      // user (and tool) role: emit a text message unless it carried only
      // tool results (those become their own `role: "tool"` messages below).
      if (content.length > 0 || toolResults.length === 0) {
        out.push({ role: "user", content });
      }
    }

    for (const r of toolResults) {
      out.push({
        role: "tool",
        tool_call_id: r.toolCallId,
        content: r.content.length > 0 ? r.content : "(no output)",
      });
    }
  }

  return out;
}

/**
 * Build the full wire request. Always streaming (`stream: true`, usage
 * reporting on); optional fields are omitted rather than sent as `null` so
 * provider defaults apply.
 */
export function serializeRequest(
  messages: readonly Message[],
  opts?: CallOptions,
): WireRequest {
  const req: WireRequest = {
    model: opts?.model ?? "deepseek-chat",
    messages: serializeMessages(messages),
    stream: true,
    stream_options: { include_usage: true },
  };

  if (opts?.maxTokens !== undefined) req.max_tokens = opts.maxTokens;
  if (opts?.temperature !== undefined) req.temperature = opts.temperature;
  if (opts?.tools && opts.tools.length > 0) {
    req.tools = opts.tools.map(
      (t: ToolDefinition): WireTool => ({
        type: "function",
        function: { name: t.name, description: t.description, parameters: t.parameters },
      }),
    );
  }

  return req;
}
