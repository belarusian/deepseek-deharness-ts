import { describe, it, expect } from "vitest";
import {
  runAgent,
  ToolRegistry,
  addTool,
  FakeLlmAdapter,
  assistantMessage,
  textBlock,
  toolCallBlock,
  textDelta,
  toolCallDelta,
  usageInfo,
  finishChunk,
  streamEnd,
  makeLlmStream,
  type LlmAdapter,
} from "../index.js";

/**
 * Streaming model steps (cycle 12). These cases drive `runAgent` with
 * `stream: true`, so each model step is folded from `adapter.stream` via
 * `assembleAssistant` instead of the single assembled `adapter.complete`.
 * All adapters are deterministic `FakeLlmAdapter`s with explicit `chunks`
 * (no network / fs / `Date.now()`).
 */
describe("runAgent streaming (stream: true)", () => {
  it("(a) streaming text-only turn -> completed, [user, assistant], text 'Hello'", async () => {
    const adapter = new FakeLlmAdapter([
      {
        message: assistantMessage([textBlock("Hello")], "stop"),
        chunks: [textDelta("Hel"), textDelta("lo")],
      },
    ]);
    const tools = new ToolRegistry();
    const result = await runAgent({ adapter, tools, stream: true }, "hi");
    expect(result.end).toBe("completed");
    expect(result.steps).toBe(1);
    expect(result.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    const assistant = result.messages[1];
    expect(assistant.role).toBe("assistant");
    expect(assistant.blocks.length).toBe(1);
    const block = assistant.blocks[0];
    expect(block.type).toBe("text");
    if (block.type === "text") expect(block.text).toBe("Hello");
  });

  it("(b) streaming tool round-trip: args concatenated across deltas -> add(2,3) -> '5'", async () => {
    const adapter = new FakeLlmAdapter([
      {
        message: assistantMessage(
          [toolCallBlock("c1", "add", '{"a":2,"b":3}')],
          "tool_calls",
        ),
        chunks: [
          toolCallDelta("c1", "add", '{"a":2'),
          toolCallDelta("c1", "add", ',"b":3}'),
          finishChunk("tool_calls"),
        ],
      },
      { message: assistantMessage([textBlock("done")], "stop") },
    ]);
    const tools = new ToolRegistry();
    tools.add(addTool);
    const result = await runAgent({ adapter, tools, stream: true }, "add 2 and 3");
    expect(result.end).toBe("completed");
    expect(result.messages.map((m) => m.role)).toEqual([
      "user",
      "assistant",
      "tool",
      "assistant",
    ]);
    // The streamed assistant's tool_call block must carry the concatenated args.
    const firstAssistant = result.messages[1];
    const call = firstAssistant.blocks[0];
    expect(call.type).toBe("tool_call");
    if (call.type === "tool_call") {
      expect(call.id).toBe("c1");
      expect(call.name).toBe("add");
      expect(call.arguments).toBe('{"a":2,"b":3}');
    }
    const toolMsg = result.messages[2];
    const block = toolMsg.blocks[0];
    expect(block.type).toBe("tool_result");
    if (block.type === "tool_result") {
      expect(block.content).toBe("5");
      expect(block.toolCallId).toBe("c1");
    }
  });

  it("(c) streaming with usage: usage chunk folded, assistant message well-formed", async () => {
    const adapter = new FakeLlmAdapter([
      {
        message: assistantMessage([textBlock("hi there")], "stop"),
        chunks: [textDelta("hi "), textDelta("there"), usageInfo(10, 5)],
      },
    ]);
    const tools = new ToolRegistry();
    const result = await runAgent({ adapter, tools, stream: true }, "hello");
    expect(result.end).toBe("completed");
    const assistant = result.messages[1];
    expect(assistant.role).toBe("assistant");
    expect(assistant.finishReason).toBe("stop");
    expect(assistant.blocks.length).toBe(1);
    const block = assistant.blocks[0];
    expect(block.type).toBe("text");
    if (block.type === "text") expect(block.text).toBe("hi there");
  });

  it("(d) streaming error containment: a stream that throws -> end 'error', driver stays total", async () => {
    const throwingAdapter: LlmAdapter = {
      async complete() {
        throw new Error("complete should not be called in stream mode");
      },
      stream() {
        return {
          [Symbol.asyncIterator]() {
            return {
              async next() {
                throw new Error("stream blew up");
              },
            };
          },
        };
      },
    };
    const tools = new ToolRegistry();
    const result = await runAgent(
      { adapter: throwingAdapter, tools, stream: true },
      "hi",
    );
    expect(result.end).toBe("error");
    // The driver is total: a subsequent fresh turn with a working adapter
    // still completes.
    const goodAdapter = new FakeLlmAdapter([
      { message: assistantMessage([textBlock("ok")], "stop") },
    ]);
    const result2 = await runAgent(
      { adapter: goodAdapter, tools, stream: true },
      "again",
    );
    expect(result2.end).toBe("completed");
    expect(result2.steps).toBe(1);
  });

  it("(e) streaming abort: pre-aborted signal -> end 'aborted', steps 0", async () => {
    const adapter = new FakeLlmAdapter([
      {
        message: assistantMessage([textBlock("never")], "stop"),
        chunks: [textDelta("never")],
      },
    ]);
    const tools = new ToolRegistry();
    const controller = new AbortController();
    controller.abort();
    const result = await runAgent(
      { adapter, tools, stream: true, signal: controller.signal },
      "hi",
    );
    expect(result.end).toBe("aborted");
    expect(result.steps).toBe(0);
  });

  it("(f) default path regression: stream omitted (false) still uses adapter.complete", async () => {
    const adapter = new FakeLlmAdapter([
      { message: assistantMessage([textBlock("plain")], "stop") },
    ]);
    const tools = new ToolRegistry();
    const result = await runAgent({ adapter, tools }, "hi");
    expect(result.end).toBe("completed");
    expect(result.steps).toBe(1);
    const assistant = result.messages[1];
    expect(assistant.blocks.length).toBe(1);
    const block = assistant.blocks[0];
    expect(block.type).toBe("text");
    if (block.type === "text") expect(block.text).toBe("plain");
  });
});

/**
 * `assembleAssistant` is also exercised directly (the seam's public fold),
 * including the `StreamEnd`-wins-over-mid-stream-`finish` rule and the
 * first-seen tool-call ordering.
 */
describe("assembleAssistant (direct fold)", () => {
  it("folds text + tool_call deltas, StreamEnd finishReason wins over mid-stream finish", async () => {
    const stream = makeLlmStream(
      [
        textDelta("A"),
        textDelta("B"),
        toolCallDelta("t2", "second", '{"x":1}'),
        toolCallDelta("t1", "first", '{"y":2}'),
        finishChunk("length"),
      ],
      streamEnd("stop"),
    );
    const { assembleAssistant } = await import("../index.js");
    const msg = await assembleAssistant(stream);
    expect(msg.role).toBe("assistant");
    expect(msg.finishReason).toBe("stop"); // end wins over the mid-stream "length"
    // Text block first, then tool_calls in first-seen order (t2 before t1).
    expect(msg.blocks.map((b) => b.type)).toEqual([
      "text",
      "tool_call",
      "tool_call",
    ]);
    const [text, c2, c1] = msg.blocks as [
      { type: "text"; text: string },
      { type: "tool_call"; id: string; name: string; arguments: string },
      { type: "tool_call"; id: string; name: string; arguments: string },
    ];
    expect(text.text).toBe("AB");
    expect(c2.id).toBe("t2");
    expect(c2.name).toBe("second");
    expect(c1.id).toBe("t1");
    expect(c1.name).toBe("first");
  });

  it("propagates a throwing stream (does not catch)", async () => {
    const { assembleAssistant } = await import("../index.js");
    const throwing = {
      [Symbol.asyncIterator]() {
        return {
          async next() {
            throw new Error("boom");
          },
        };
      },
    };
    await expect(assembleAssistant(throwing)).rejects.toThrow("boom");
  });
});
