import { describe, it, expect } from "vitest";
import {
  textBlock,
  toolCallBlock,
  toolResultBlock,
  message,
  assistantMessage,
  textDelta,
  toolCallDelta,
  usageInfo,
  finishChunk,
  streamEnd,
  makeLlmStream,
  LlmFailure,
  FakeLlmAdapter,
} from "../index.js";
import type { StreamChunk, StreamEnd } from "../index.js";

describe("llm message vocabulary", () => {
  it("builds a frozen text block", () => {
    const b = textBlock("hi");
    expect(b).toEqual({ type: "text", text: "hi" });
    expect(Object.isFrozen(b)).toBe(true);
  });

  it("builds a frozen tool-call block", () => {
    const b = toolCallBlock("c1", "search", '{"q":"x"}');
    expect(b).toEqual({
      type: "tool_call",
      id: "c1",
      name: "search",
      arguments: '{"q":"x"}',
    });
    expect(Object.isFrozen(b)).toBe(true);
  });

  it("builds a frozen tool-result block, omitting isError when undefined", () => {
    const ok = toolResultBlock("c1", "result");
    expect(ok).toEqual({ type: "tool_result", toolCallId: "c1", content: "result" });
    expect("isError" in ok).toBe(false);

    const err = toolResultBlock("c1", "boom", true);
    expect(err.isError).toBe(true);
    expect(Object.isFrozen(err)).toBe(true);
  });

  it("builds a frozen message and omits optional fields", () => {
    const m = message("user", [textBlock("hello")]);
    expect(m).toEqual({ role: "user", blocks: [{ type: "text", text: "hello" }] });
    expect("callId" in m).toBe(false);
    expect("finishReason" in m).toBe(false);
    expect(Object.isFrozen(m)).toBe(true);
    expect(Object.isFrozen(m.blocks)).toBe(true);
  });

  it("builds a frozen assistant message with role pinned to assistant", () => {
    const m = assistantMessage([textBlock("done")], "stop");
    expect(m.role).toBe("assistant");
    expect(m.finishReason).toBe("stop");
    expect(Object.isFrozen(m)).toBe(true);
  });
});

describe("llm stream vocabulary", () => {
  it("builds frozen chunk shapes", () => {
    expect(textDelta("a")).toEqual({ type: "text_delta", text: "a" });
    expect(toolCallDelta("c1", "f", "{}")).toEqual({
      type: "tool_call_delta",
      id: "c1",
      name: "f",
      arguments: "{}",
    });
    expect(usageInfo(3, 4)).toEqual({ type: "usage", promptTokens: 3, completionTokens: 4 });
    expect(finishChunk("stop")).toEqual({ type: "finish", reason: "stop" });
  });

  it("builds a frozen StreamEnd, omitting usage when undefined", () => {
    const end = streamEnd("stop");
    expect(end).toEqual({ finishReason: "stop" });
    expect("usage" in end).toBe(false);
    expect(Object.isFrozen(end)).toBe(true);

    const withUsage = streamEnd("stop", { promptTokens: 1, completionTokens: 2 });
    expect(withUsage.usage).toEqual({ promptTokens: 1, completionTokens: 2 });
  });

  it("makeLlmStream yields chunks then a terminal StreamEnd", async () => {
    const chunks: readonly StreamChunk[] = [textDelta("a"), textDelta("b")];
    const end: StreamEnd = streamEnd("stop");
    const stream = makeLlmStream(chunks, end);
    const seen: (StreamChunk | StreamEnd)[] = [];
    for await (const v of stream) seen.push(v);
    expect(seen).toEqual([
      { type: "text_delta", text: "a" },
      { type: "text_delta", text: "b" },
      { finishReason: "stop" },
    ]);
  });
});

describe("LlmFailure", () => {
  it("carries message, stable code, and optional status/retryAfterMs", () => {
    const f = new LlmFailure("rate limited", "rate_limited", 429, 1500);
    expect(f).toBeInstanceOf(Error);
    expect(f).toBeInstanceOf(LlmFailure);
    expect(f.name).toBe("LlmFailure");
    expect(f.message).toBe("rate limited");
    expect(f.code).toBe("rate_limited");
    expect(f.status).toBe(429);
    expect(f.retryAfterMs).toBe(1500);
  });

  it("leaves status/retryAfterMs undefined when not supplied", () => {
    const f = new LlmFailure("nope", "error");
    expect(f.status).toBeUndefined();
    expect(f.retryAfterMs).toBeUndefined();
  });
});

describe("FakeLlmAdapter", () => {
  it("complete drains the scripted queue in order", async () => {
    const a = assistantMessage([textBlock("one")], "stop");
    const b = assistantMessage([textBlock("two")], "stop");
    const adapter = new FakeLlmAdapter([
      { message: a },
      { message: b },
    ]);
    expect(adapter.remaining).toBe(2);
    expect(await adapter.complete([])).toBe(a);
    expect(adapter.remaining).toBe(1);
    expect(await adapter.complete([])).toBe(b);
    expect(adapter.remaining).toBe(0);
  });

  it("stream yields explicit chunks then a StreamEnd", async () => {
    const msg = assistantMessage([textBlock("x")], "stop");
    const adapter = new FakeLlmAdapter([
      { message: msg, chunks: [textDelta("x")] },
    ]);
    const seen: (StreamChunk | StreamEnd)[] = [];
    for await (const v of adapter.stream([])) seen.push(v);
    expect(seen).toEqual([
      { type: "text_delta", text: "x" },
      { finishReason: "stop" },
    ]);
  });

  it("stream derives chunks from the first text block when none supplied", async () => {
    const msg = assistantMessage([textBlock("hello"), textBlock("world")], "stop");
    const adapter = new FakeLlmAdapter([{ message: msg }]);
    const seen: (StreamChunk | StreamEnd)[] = [];
    for await (const v of adapter.stream([])) seen.push(v);
    expect(seen).toEqual([
      { type: "text_delta", text: "hello" },
      { type: "text_delta", text: "world" },
      { finishReason: "stop" },
    ]);
  });

  it("throws LlmFailure with code 'exhausted' when the queue is empty", async () => {
    const adapter = new FakeLlmAdapter([]);
    await expect(adapter.complete([])).rejects.toThrow(LlmFailure);
    await expect(adapter.complete([])).rejects.toMatchObject({ code: "exhausted" });
    expect(() => adapter.stream([])).toThrow(LlmFailure);
  });
});
