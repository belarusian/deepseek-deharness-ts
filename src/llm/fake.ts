/**
 * A **deterministic fake adapter** for the LLM seam.
 *
 * `FakeLlmAdapter` implements {@link LlmAdapter} with a scripted queue of
 * {@link ScriptedResponse}s. It is fully deterministic and makes no network
 * calls, so the agent loop and session can compose the seam in tests without a
 * live provider.
 */

import type { AssistantMessage, Message } from "./message.js";
import { LlmFailure } from "./adapter.js";
import type { LlmAdapter, CallOptions } from "./adapter.js";
import type { LlmStream, StreamChunk, StreamEnd } from "./stream.js";
import { makeLlmStream, streamEnd, textDelta } from "./stream.js";

/** One scripted response: the assembled message plus optional stream chunks. */
export interface ScriptedResponse {
  readonly message: AssistantMessage;
  /**
   * The chunks `stream()` yields before the terminal `StreamEnd`. When absent,
   * the stream is derived from the message's first text block.
   */
  readonly chunks?: readonly StreamChunk[];
}

/**
 * A scripted, in-memory {@link LlmAdapter}. Responses are consumed in order;
 * exhausting the queue throws {@link LlmFailure} with code `"exhausted"`.
 *
 * The adapter also **records** the {@link CallOptions} it is called with (on
 * every `complete` and `stream`), so a test can assert the `model` /
 * `maxTokens` passthrough without a live provider. The recording does not
 * change the scripted-response behavior.
 */
export class FakeLlmAdapter implements LlmAdapter {
  private readonly queue: readonly ScriptedResponse[];
  private cursor = 0;
  private readonly recorded: (CallOptions | undefined)[] = [];

  constructor(responses: readonly ScriptedResponse[]) {
    this.queue = Object.freeze([...responses]);
  }

  /** The `CallOptions` recorded for every `complete`/`stream` call, in order. */
  get callOptions(): readonly (CallOptions | undefined)[] {
    return this.recorded;
  }

  /** The `CallOptions` of the most recent call (or `undefined` if none). */
  get lastCallOptions(): CallOptions | undefined {
    return this.recorded[this.recorded.length - 1];
  }

  /** The number of scripted responses not yet consumed. */
  get remaining(): number {
    return this.queue.length - this.cursor;
  }

  private next(): ScriptedResponse {
    if (this.cursor >= this.queue.length) {
      throw new LlmFailure(
        "FakeLlmAdapter: scripted responses exhausted",
        "exhausted",
      );
    }
    return this.queue[this.cursor++];
  }

  async complete(
    _messages: readonly Message[],
    opts?: CallOptions,
  ): Promise<AssistantMessage> {
    this.recorded.push(opts);
    return this.next().message;
  }

  stream(_messages: readonly Message[], opts?: CallOptions): LlmStream {
    this.recorded.push(opts);
    const { message, chunks } = this.next();
    const derived: readonly StreamChunk[] =
      chunks ?? deriveChunks(message);
    const end: StreamEnd = streamEnd(message.finishReason ?? "stop");
    return makeLlmStream(derived, end);
  }
}

/**
 * Derive a minimal chunk list from an assistant message: one text delta per
 * text block, in order. Used when a {@link ScriptedResponse} supplies no
 * explicit `chunks`.
 */
function deriveChunks(message: AssistantMessage): StreamChunk[] {
  const out: StreamChunk[] = [];
  for (const block of message.blocks) {
    if (block.type === "text") out.push(textDelta(block.text));
  }
  return out;
}
