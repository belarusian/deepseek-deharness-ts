/**
 * The **stream vocabulary** of the LLM seam.
 *
 * A {@link LlmStream} is a plain async iterable that yields {@link StreamChunk}s
 * and terminates with a single {@link StreamEnd}. Plain types only — no DI, no
 * branded types, no Cordis event seams.
 */

/** A partial text delta. */
export interface TextDelta {
  readonly type: "text_delta";
  readonly text: string;
}

/** A partial tool-call delta (arguments may arrive incrementally). */
export interface ToolCallDelta {
  readonly type: "tool_call_delta";
  readonly id: string;
  readonly name: string;
  readonly arguments: string;
}

/** Token accounting reported mid- or end-of-stream. */
export interface UsageInfo {
  readonly type: "usage";
  readonly promptTokens: number;
  readonly completionTokens: number;
}

/** A mid-stream marker carrying the finish reason. */
export interface FinishChunk {
  readonly type: "finish";
  readonly reason: string;
}

/** The stream-chunk union. */
export type StreamChunk = TextDelta | ToolCallDelta | UsageInfo | FinishChunk;

/** Token accounting carried by {@link StreamEnd}. */
export interface StreamUsage {
  readonly promptTokens: number;
  readonly completionTokens: number;
}

/** The terminal value of a {@link LlmStream}. */
export interface StreamEnd {
  readonly finishReason: string;
  readonly usage?: StreamUsage;
}

/**
 * A minimal LLM stream: an async iterable of {@link StreamChunk}s that yields
 * exactly one terminal {@link StreamEnd} as its last value.
 */
export interface LlmStream {
  [Symbol.asyncIterator](): AsyncIterator<StreamChunk | StreamEnd>;
}

// ── Construction helpers ───────────────────────────────────────────────────

/** Build a frozen {@link TextDelta}. */
export function textDelta(text: string): TextDelta {
  return Object.freeze({ type: "text_delta", text });
}

/** Build a frozen {@link ToolCallDelta}. */
export function toolCallDelta(
  id: string,
  name: string,
  args: string,
): ToolCallDelta {
  return Object.freeze({ type: "tool_call_delta", id, name, arguments: args });
}

/** Build a frozen {@link UsageInfo}. */
export function usageInfo(
  promptTokens: number,
  completionTokens: number,
): UsageInfo {
  return Object.freeze({ type: "usage", promptTokens, completionTokens });
}

/** Build a frozen {@link FinishChunk}. */
export function finishChunk(reason: string): FinishChunk {
  return Object.freeze({ type: "finish", reason });
}

/** Build a frozen {@link StreamEnd}; `usage` is omitted when `undefined`. */
export function streamEnd(
  finishReason: string,
  usage?: StreamUsage,
): StreamEnd {
  return Object.freeze({
    finishReason,
    ...(usage !== undefined ? { usage: Object.freeze({ ...usage }) } : {}),
  });
}

/**
 * Build a {@link LlmStream} from a list of chunks plus a terminal
 * {@link StreamEnd}. The end is always appended as the final value.
 */
export function makeLlmStream(
  chunks: readonly StreamChunk[],
  end: StreamEnd,
): LlmStream {
  const values: readonly (StreamChunk | StreamEnd)[] = Object.freeze([
    ...chunks,
    end,
  ]);
  return {
    [Symbol.asyncIterator]() {
      let i = 0;
      return {
        async next(): Promise<IteratorResult<StreamChunk | StreamEnd>> {
          if (i < values.length) {
            return { value: values[i++], done: false };
          }
          return { value: undefined, done: true };
        },
      };
    },
  };
}
