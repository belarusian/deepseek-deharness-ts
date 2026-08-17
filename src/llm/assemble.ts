/**
 * The **stream assembler** of the LLM seam.
 *
 * `assembleAssistant` is a plain, total fold over an {@link LlmStream}: it
 * consumes the stream's {@link StreamChunk}s and terminal {@link StreamEnd} and
 * assembles a single frozen {@link AssistantMessage}.
 *
 * This INVERTS the seed's stateful `BlockAssembler` (a per-index block-assembly
 * machine) into a single pure async function: no DI, no state machine, no `ctx`.
 * It groups `tool_call_delta`s by `id` and concatenates their `arguments` —
 * enough for the deterministic tests and the DeepSeek wire (which groups by
 * index/id).
 *
 * The fold is total *at the fold level*: it does NOT catch a stream that throws.
 * A throwing stream propagates to the caller (`runTurn`), which contains it into
 * `end: "error"`.
 */

import {
  assistantMessage,
  textBlock,
  toolCallBlock,
  type AssistantMessage,
  type ContentBlock,
} from "./message.js";
import type { LlmStream, StreamChunk, StreamEnd } from "./stream.js";

/**
 * Fold an {@link LlmStream} into a single frozen {@link AssistantMessage}.
 *
 * Block order is deterministic: a single text block first (when any text was
 * seen), then one `tool_call` block per id in first-seen order. The terminal
 * {@link StreamEnd}'s `finishReason` wins over any mid-stream `finish` chunk.
 *
 * @throws whatever the stream throws (the fold does not catch).
 */
export async function assembleAssistant(
  stream: LlmStream,
): Promise<AssistantMessage> {
  let text = "";
  let sawText = false;
  // First-seen id order + per-id accumulated name/arguments.
  const order: string[] = [];
  const names = new Map<string, string>();
  const args = new Map<string, string>();
  let finishReason: string | undefined;

  for await (const value of stream) {
    if ("type" in value === false) {
      // Terminal StreamEnd: its finishReason wins, then stop.
      const end = value as StreamEnd;
      finishReason = end.finishReason;
      break;
    }
    const chunk = value as StreamChunk;
    switch (chunk.type) {
      case "text_delta":
        text += chunk.text;
        sawText = true;
        break;
      case "tool_call_delta": {
        if (!names.has(chunk.id)) {
          order.push(chunk.id);
          names.set(chunk.id, "");
          args.set(chunk.id, "");
        }
        // Name: first non-empty wins.
        if (chunk.name !== "" && names.get(chunk.id) === "") {
          names.set(chunk.id, chunk.name);
        }
        // Arguments: concatenate across deltas.
        args.set(chunk.id, (args.get(chunk.id) ?? "") + chunk.arguments);
        break;
      }
      case "usage":
        // Token accounting is folded (recorded) but not surfaced: the seam's
        // AssistantMessage carries no usage field.
        break;
      case "finish":
        finishReason = chunk.reason;
        break;
    }
  }

  const blocks: ContentBlock[] = [];
  if (sawText) blocks.push(textBlock(text));
  for (const id of order) {
    blocks.push(toolCallBlock(id, names.get(id) ?? "", args.get(id) ?? ""));
  }

  return assistantMessage(blocks, finishReason);
}
