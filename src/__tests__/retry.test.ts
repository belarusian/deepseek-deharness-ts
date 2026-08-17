import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  withRetry,
  LlmFailure,
  assistantMessage,
  textBlock,
  textDelta,
  streamEnd,
} from "../index.js";
import { __setRetryInternals, __resetRetryInternals } from "../llm/retry.js";
import type {
  LlmAdapter,
  CallOptions,
  Message,
  LlmStream,
  StreamChunk,
  StreamEnd,
} from "../index.js";
import type { AssistantMessage } from "../llm/index.js";

// ── test doubles ────────────────────────────────────────────────────────────

/** An adapter whose `complete` throws the given failures in order, then succeeds. */
class ScriptedCompleteAdapter implements LlmAdapter {
  private readonly failures: readonly LlmFailure[];
  private readonly success: AssistantMessage;
  calls = 0;

  constructor(failures: readonly LlmFailure[], success: AssistantMessage) {
    this.failures = failures;
    this.success = success;
  }

  async complete(_m: readonly Message[], _o?: CallOptions): Promise<AssistantMessage> {
    this.calls += 1;
    const i = this.calls - 1;
    if (i < this.failures.length) throw this.failures[i];
    return this.success;
  }

  stream(_m: readonly Message[], _o?: CallOptions): LlmStream {
    throw new Error("not used");
  }
}

/** An adapter whose `stream` yields the given values, throwing at the given index. */
class ScriptedStreamAdapter implements LlmAdapter {
  private readonly values: readonly (StreamChunk | StreamEnd)[];
  /** Index at which to throw (before yielding that value); -1 = never. */
  private readonly throwAt: number;
  private readonly failure: LlmFailure | null;
  /** How many initial calls throw (before yielding normally). */
  private readonly throwCalls: number;
  private readonly success: AssistantMessage;
  calls = 0;

  constructor(
    values: readonly (StreamChunk | StreamEnd)[],
    failure: LlmFailure | null,
    throwAt = -1,
    throwCalls = 1,
  ) {
    this.values = values;
    this.failure = failure;
    this.throwAt = throwAt;
    this.throwCalls = throwCalls;
    this.success = assistantMessage([textBlock("ok")], "stop");
  }

  async complete(_m: readonly Message[], _o?: CallOptions): Promise<AssistantMessage> {
    return this.success;
  }

  stream(_m: readonly Message[], _o?: CallOptions): LlmStream {
    this.calls += 1;
    const values = this.values;
    const throwAt = this.throwAt;
    const failure = this.failure;
    const shouldThrow = this.calls <= this.throwCalls;
    return {
      [Symbol.asyncIterator]() {
        let i = 0;
        return {
          async next(): Promise<IteratorResult<StreamChunk | StreamEnd>> {
            if (shouldThrow && throwAt >= 0 && i === throwAt) {
              if (failure) throw failure;
              throw new Error("boom");
            }
            if (i < values.length) return { value: values[i++], done: false };
            return { value: undefined, done: true };
          },
        };
      },
    };
  }
}

const okMsg = assistantMessage([textBlock("hello")], "stop");
const okStream = [textDelta("a"), textDelta("b"), streamEnd("stop")];

// ── complete() ──────────────────────────────────────────────────────────────

describe("withRetry.complete", () => {
  beforeEach(() => __resetRetryInternals());
  afterEach(() => __resetRetryInternals());

  it("returns a new adapter (not the same reference)", () => {
    const inner = new ScriptedCompleteAdapter([], okMsg);
    const wrapped = withRetry(inner);
    expect(wrapped).not.toBe(inner);
    expect(wrapped).toBeInstanceOf(Object);
  });

  it("retries rate_limited then succeeds", async () => {
    const delays: number[] = [];
    __setRetryInternals({ sleep: async (ms) => { delays.push(ms); }, random: () => 0 });
    const inner = new ScriptedCompleteAdapter(
      [new LlmFailure("rl", "rate_limited", 429)],
      okMsg,
    );
    const out = await withRetry(inner, { jitter: false }).complete([]);
    expect(out).toBe(okMsg);
    expect(inner.calls).toBe(2);
    expect(delays).toEqual([500]);
  });

  it("retries overloaded then succeeds", async () => {
    __setRetryInternals({ sleep: async () => {}, random: () => 0 });
    const inner = new ScriptedCompleteAdapter(
      [new LlmFailure("ov", "overloaded", 503)],
      okMsg,
    );
    const out = await withRetry(inner, { jitter: false }).complete([]);
    expect(out).toBe(okMsg);
    expect(inner.calls).toBe(2);
  });

  it("retries http_5xx (http_500) then succeeds", async () => {
    __setRetryInternals({ sleep: async () => {}, random: () => 0 });
    const inner = new ScriptedCompleteAdapter(
      [new LlmFailure("ise", "http_500", 500)],
      okMsg,
    );
    const out = await withRetry(inner, { jitter: false }).complete([]);
    expect(out).toBe(okMsg);
    expect(inner.calls).toBe(2);
  });

  it.each(["auth", "malformed_response", "stream_closed", "exhausted", "http_400"])(
    "does NOT retry %s (passes through on first throw)",
    async (code) => {
      const delays: number[] = [];
      __setRetryInternals({ sleep: async (ms) => { delays.push(ms); }, random: () => 0 });
      const inner = new ScriptedCompleteAdapter(
        [new LlmFailure("nope", code)],
        okMsg,
      );
      await expect(
        withRetry(inner, { jitter: false }).complete([]),
      ).rejects.toMatchObject({ code });
      expect(inner.calls).toBe(1);
      expect(delays).toEqual([]);
    },
  );

  it("rethrows the last failure after maxRetries exhaustion", async () => {
    __setRetryInternals({ sleep: async () => {}, random: () => 0 });
    const f1 = new LlmFailure("a", "rate_limited", 429);
    const f2 = new LlmFailure("b", "overloaded", 503);
    const f3 = new LlmFailure("c", "http_500", 500);
    const f4 = new LlmFailure("d", "rate_limited", 429);
    const inner = new ScriptedCompleteAdapter([f1, f2, f3, f4], okMsg);
    const wrapped = withRetry(inner, { maxRetries: 3, jitter: false });
    await expect(wrapped.complete([])).rejects.toBe(f4);
    // 1 initial + 3 retries = 4 attempts, all fail -> rethrow the last.
    expect(inner.calls).toBe(4);
  });

  it("honors maxRetries=0 (no retries)", async () => {
    __setRetryInternals({ sleep: async () => {}, random: () => 0 });
    const f = new LlmFailure("a", "rate_limited", 429);
    const inner = new ScriptedCompleteAdapter([f], okMsg);
    await expect(
      withRetry(inner, { maxRetries: 0, jitter: false }).complete([]),
    ).rejects.toBe(f);
    expect(inner.calls).toBe(1);
  });

  it("uses exponential backoff capped at maxDelayMs (jitter off)", async () => {
    const delays: number[] = [];
    __setRetryInternals({
      sleep: async (ms) => { delays.push(ms); },
      random: () => 0,
    });
    const failures = [
      new LlmFailure("a", "rate_limited", 429),
      new LlmFailure("b", "rate_limited", 429),
      new LlmFailure("c", "rate_limited", 429),
      new LlmFailure("d", "rate_limited", 429),
    ];
    const inner = new ScriptedCompleteAdapter(failures, okMsg);
    await withRetry(inner, {
      maxRetries: 4,
      baseDelayMs: 100,
      maxDelayMs: 250,
      jitter: false,
    }).complete([]);
    // n=0:100, n=1:200, n=2:min(400,250)=250, n=3:min(800,250)=250
    expect(delays).toEqual([100, 200, 250, 250]);
  });

  it("applies full jitter so the delay lands in [0, cap] (jitter on)", async () => {
    const delays: number[] = [];
    // A deterministic pseudo-random sequence covering the full range.
    const seq = [0, 0.5, 1, 0.25, 0.75];
    let i = 0;
    __setRetryInternals({
      sleep: async (ms) => { delays.push(ms); },
      random: () => seq[i++ % seq.length],
    });
    const failures = [
      new LlmFailure("a", "overloaded", 503),
      new LlmFailure("b", "overloaded", 503),
      new LlmFailure("c", "overloaded", 503),
    ];
    const inner = new ScriptedCompleteAdapter(failures, okMsg);
    await withRetry(inner, {
      maxRetries: 3,
      baseDelayMs: 100,
      maxDelayMs: 10000,
      jitter: true,
    }).complete([]);
    // caps: n=0:100, n=1:200, n=2:400
    const caps = [100, 200, 400];
    expect(delays).toHaveLength(3);
    for (let k = 0; k < delays.length; k++) {
      expect(delays[k]).toBeGreaterThanOrEqual(0);
      expect(delays[k]).toBeLessThanOrEqual(caps[k]);
    }
    // With this RNG the values are not all equal to the cap (jitter applied).
    expect(delays[0]).toBe(0); // 0 * 100
    expect(delays[1]).toBe(100); // 0.5 * 200
    expect(delays[2]).toBe(400); // 1 * 400
  });
});

// ── stream() ────────────────────────────────────────────────────────────────

describe("withRetry.stream", () => {
  beforeEach(() => __resetRetryInternals());
  afterEach(() => __resetRetryInternals());

  it("retries a transient failure on the first next() then yields the stream", async () => {
    const delays: number[] = [];
    __setRetryInternals({ sleep: async (ms) => { delays.push(ms); }, random: () => 0 });
    const inner = new ScriptedStreamAdapter(
      okStream,
      new LlmFailure("rl", "rate_limited", 429),
      0, // throw on the very first next()
    );
    const wrapped = withRetry(inner, { jitter: false });
    const seen: (StreamChunk | StreamEnd)[] = [];
    for await (const v of wrapped.stream([])) seen.push(v);
    expect(seen).toEqual(okStream);
    // First attempt threw, second succeeded: 2 inner streams created.
    expect(inner.calls).toBe(2);
    expect(delays).toEqual([500]);
  });

  it("does NOT retry a non-retryable failure on the first next()", async () => {
    const delays: number[] = [];
    __setRetryInternals({ sleep: async (ms) => { delays.push(ms); }, random: () => 0 });
    const inner = new ScriptedStreamAdapter(
      okStream,
      new LlmFailure("auth", "auth", 401),
      0,
    );
    const wrapped = withRetry(inner, { jitter: false });
    await expect(collect(wrapped.stream([]))).rejects.toMatchObject({ code: "auth" });
    expect(inner.calls).toBe(1);
    expect(delays).toEqual([]);
  });

  it("retries only before the first chunk: a transient failure AFTER the first chunk is NOT retried", async () => {
    const delays: number[] = [];
    __setRetryInternals({ sleep: async (ms) => { delays.push(ms); }, random: () => 0 });
    // First value yields fine; the failure is thrown on the 2nd next() (index 1).
    const inner = new ScriptedStreamAdapter(
      [textDelta("a"), textDelta("b"), streamEnd("stop")],
      new LlmFailure("rl", "rate_limited", 429),
      1,
    );
    const wrapped = withRetry(inner, { jitter: false });
    const seen: (StreamChunk | StreamEnd)[] = [];
    await expect(
      (async () => {
        for await (const v of wrapped.stream([])) seen.push(v);
      })(),
    ).rejects.toMatchObject({ code: "rate_limited" });
    // The first chunk was delivered, then the error propagated with no retry.
    expect(seen).toEqual([{ type: "text_delta", text: "a" }]);
    expect(inner.calls).toBe(1);
    expect(delays).toEqual([]);
  });

  it("forwards all values verbatim after the first chunk (no duplication)", async () => {
    __setRetryInternals({ sleep: async () => {}, random: () => 0 });
    const inner = new ScriptedStreamAdapter(okStream, null, -1);
    const wrapped = withRetry(inner, { jitter: false });
    const seen: (StreamChunk | StreamEnd)[] = [];
    for await (const v of wrapped.stream([])) seen.push(v);
    expect(seen).toEqual(okStream);
    expect(inner.calls).toBe(1);
  });

  it("rethrows the last transient failure after exhaustion on the first next()", async () => {
    __setRetryInternals({ sleep: async () => {}, random: () => 0 });
    const f = new LlmFailure("rl", "rate_limited", 429);
    const inner = new ScriptedStreamAdapter(okStream, f, 0, 10);
    const wrapped = withRetry(inner, { maxRetries: 2, jitter: false });
    await expect(collect(wrapped.stream([]))).rejects.toBe(f);
    // 1 initial + 2 retries = 3 inner streams.
    expect(inner.calls).toBe(3);
  });
});

// ── helpers ─────────────────────────────────────────────────────────────────

async function collect(stream: LlmStream): Promise<void> {
  for await (const _v of stream) {
    // drain
  }
}
