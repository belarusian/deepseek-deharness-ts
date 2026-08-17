/**
 * Translate DeepSeek SSE `data` payloads (JSON {@link WireChunk}s) into the
 * provider-neutral stream vocabulary.
 *
 * Text deltas and tool-call fragments are yielded as they arrive. Usage and
 * the finish reason are deferred to the `[DONE]` sentinel: they are emitted as
 * terminal `usage`/`finish` chunks immediately before the final {@link
 * StreamEnd}, which also carries the finish reason and usage. Malformed JSON
 * aborts the stream with a {@link LlmFailure} of code `"malformed_response"`.
 *
 * @module llm/deepseek/translate
 */

import type { StreamChunk, StreamEnd, StreamUsage } from "../stream.js";
import { finishChunk, streamEnd, textDelta, toolCallDelta, usageInfo } from "../stream.js";
import { LlmFailure } from "../adapter.js";
import { DONE } from "./sse.js";
import type { WireChunk } from "./types.js";

/**
 * Consume SSE data payloads (ending in `[DONE]`) and yield stream chunks.
 *
 * @param payloads - SSE data payloads from {@link parseSse}, `[DONE]`-terminated.
 * @returns text/tool-call deltas as they arrive, then terminal `usage`/`finish`
 *   chunks and a final {@link StreamEnd}.
 */
export async function* translate(
  payloads: AsyncIterable<string>,
): AsyncGenerator<StreamChunk | StreamEnd> {
  let finishReason: string | null = null;
  let usage: StreamUsage | null = null;

  for await (const payload of payloads) {
    if (payload === DONE) break;

    let chunk: WireChunk;
    try {
      chunk = JSON.parse(payload) as WireChunk;
    } catch {
      throw new LlmFailure(
        `malformed SSE payload: ${payload.slice(0, 120)}`,
        "malformed_response",
      );
    }

    // Usage may arrive attached to the finish chunk or as a trailing
    // usage-only chunk — keep the latest.
    if (chunk.usage) {
      usage = {
        promptTokens: chunk.usage.prompt_tokens,
        completionTokens: chunk.usage.completion_tokens,
      };
    }

    for (const choice of chunk.choices ?? []) {
      const delta = choice.delta;
      if (delta) {
        if (typeof delta.content === "string" && delta.content.length > 0) {
          yield textDelta(delta.content);
        }
        for (const tc of delta.tool_calls ?? []) {
          yield toolCallDelta(
            tc.id ?? "",
            tc.function?.name ?? "",
            tc.function?.arguments ?? "",
          );
        }
      }
      if (typeof choice.finish_reason === "string" && choice.finish_reason.length > 0) {
        finishReason = mapFinishReason(choice.finish_reason);
      }
    }
  }

  // Deferred to [DONE]: emit accounting + finish markers, then the terminal end.
  if (usage) yield usageInfo(usage.promptTokens, usage.completionTokens);
  const reason = finishReason ?? "stop";
  yield finishChunk(reason);
  yield streamEnd(reason, usage ?? undefined);
}

/** Map the wire `finish_reason` vocabulary to the internal reason string. */
function mapFinishReason(wire: string): string {
  switch (wire) {
    case "stop":
      return "stop";
    case "tool_calls":
      return "tool_calls";
    case "length":
      return "length";
    default:
      return wire;
  }
}
