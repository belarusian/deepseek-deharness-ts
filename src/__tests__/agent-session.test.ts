import { describe, it, expect } from "vitest";
import {
  runAgent,
  ToolRegistry,
  addTool,
  FakeLlmAdapter,
  SessionLog,
  assistantMessage,
  textBlock,
  toolCallBlock,
  toSessionEvent,
  type AgentEvent,
} from "../index.js";

/** A deterministic clock pinned to a constant so `time` is stable. */
const T0 = 1_700_000_000_000;

/** Build a fresh log with a pinned clock. */
function makeLog(): SessionLog {
  return new SessionLog("sess", { clock: () => T0 });
}

describe("agent loop folds its trajectory into a SessionLog", () => {
  it("(a) text-only turn w/ log -> [turn/start, step/start, assistant/message, turn/end], seq 0-3, content flattened", async () => {
    const adapter = new FakeLlmAdapter([
      { message: assistantMessage([textBlock("Hello"), textBlock(" world")], "stop") },
    ]);
    const tools = new ToolRegistry();
    const log = makeLog();
    const result = await runAgent({ adapter, tools, log }, "hi");
    expect(result.end).toBe("completed");
    const events = log.readAll();
    expect(events.map((e) => e.type)).toEqual([
      "turn/start",
      "step/start",
      "assistant/message",
      "turn/end",
    ]);
    expect(events.map((e) => e.seq)).toEqual([0, 1, 2, 3]);
    const assistant = events[2];
    expect(assistant.type).toBe("assistant/message");
    if (assistant.type === "assistant/message") {
      expect(assistant.data.turn).toBe(1);
      expect(assistant.data.step).toBe(1);
      expect(assistant.data.message).toEqual({
        role: "assistant",
        content: "Hello world",
      });
    }
  });

  it("(b) tool round-trip add(2,3)->'5'->text->completed -> 8 events, tool/result content '5'", async () => {
    const adapter = new FakeLlmAdapter([
      {
        message: assistantMessage(
          [toolCallBlock("c1", "add", '{"a":2,"b":3}')],
          "tool_calls",
        ),
      },
      { message: assistantMessage([textBlock("done")], "stop") },
    ]);
    const tools = new ToolRegistry();
    tools.add(addTool);
    const log = makeLog();
    const result = await runAgent({ adapter, tools, log }, "add 2 and 3");
    expect(result.end).toBe("completed");
    const events = log.readAll();
    expect(events.map((e) => e.type)).toEqual([
      "turn/start",
      "step/start",
      "assistant/message",
      "tool/call",
      "tool/result",
      "step/start",
      "assistant/message",
      "turn/end",
    ]);
    expect(events).toHaveLength(8);
    const toolResult = events[4];
    expect(toolResult.type).toBe("tool/result");
    if (toolResult.type === "tool/result") {
      expect(toolResult.data.message).toEqual({
        role: "tool",
        callId: "c1",
        content: "5",
      });
      expect(toolResult.data.error).toBeUndefined();
    }
    const toolCall = events[3];
    expect(toolCall.type).toBe("tool/call");
    if (toolCall.type === "tool/call") {
      expect(toolCall.data).toEqual({
        turn: 1,
        step: 1,
        callId: "c1",
        name: "add",
        arguments: '{"a":2,"b":3}',
      });
    }
  });

  it("(c) maxSteps:1 always-tool -> turn/end reason 'max_steps'", async () => {
    const adapter = new FakeLlmAdapter([
      {
        message: assistantMessage(
          [toolCallBlock("c", "add", '{"a":1,"b":1}')],
          "tool_calls",
        ),
      },
    ]);
    const tools = new ToolRegistry();
    tools.add(addTool);
    const log = makeLog();
    const result = await runAgent({ adapter, tools, log, maxSteps: 1 }, "loop");
    expect(result.end).toBe("max_steps");
    const events = log.readAll();
    const last = events[events.length - 1];
    expect(last.type).toBe("turn/end");
    if (last.type === "turn/end") {
      expect(last.data.reason).toBe("max_steps");
    }
  });

  it("(d) log omitted -> onEvent still fires, no log", async () => {
    const adapter = new FakeLlmAdapter([
      { message: assistantMessage([textBlock("hi")], "stop") },
    ]);
    const tools = new ToolRegistry();
    const seen: AgentEvent[] = [];
    const result = await runAgent(
      { adapter, tools, onEvent: (e) => seen.push(e) },
      "hi",
    );
    expect(result.end).toBe("completed");
    expect(seen.map((e) => e.type)).toEqual([
      "turn_start",
      "step_start",
      "assistant",
      "turn_end",
    ]);
  });

  it("(e) toSessionEvent is total + pure over the six AgentEvent variants", () => {
    // turn_start
    expect(
      toSessionEvent({ type: "turn_start", turn: 3 }),
    ).toEqual({ type: "turn/start", data: { turn: 3 } });

    // step_start
    expect(
      toSessionEvent({ type: "step_start", turn: 2, step: 4 }),
    ).toEqual({ type: "step/start", data: { turn: 2, step: 4 } });

    // assistant: text blocks flattened in order; tool_call blocks dropped
    expect(
      toSessionEvent({
        type: "assistant",
        turn: 1,
        step: 2,
        message: assistantMessage(
          [textBlock("a"), toolCallBlock("c1", "add", "{}"), textBlock("b")],
          "stop",
        ),
      }),
    ).toEqual({
      type: "assistant/message",
      data: {
        turn: 1,
        step: 2,
        message: { role: "assistant", content: "ab" },
      },
    });

    // assistant: tool-call-only flattens to ""
    expect(
      toSessionEvent({
        type: "assistant",
        turn: 1,
        step: 1,
        message: assistantMessage(
          [toolCallBlock("c1", "add", '{"a":1}')],
          "tool_calls",
        ),
      }),
    ).toEqual({
      type: "assistant/message",
      data: {
        turn: 1,
        step: 1,
        message: { role: "assistant", content: "" },
      },
    });

    // tool_call: id -> callId, type dropped
    expect(
      toSessionEvent({
        type: "tool_call",
        turn: 1,
        step: 1,
        call: toolCallBlock("c9", "add", '{"a":2,"b":3}'),
      }),
    ).toEqual({
      type: "tool/call",
      data: {
        turn: 1,
        step: 1,
        callId: "c9",
        name: "add",
        arguments: '{"a":2,"b":3}',
      },
    });

    // tool_result (success): no error field
    expect(
      toSessionEvent({
        type: "tool_result",
        turn: 1,
        step: 1,
        result: { type: "tool_result", toolCallId: "c9", content: "5" },
      }),
    ).toEqual({
      type: "tool/result",
      data: {
        turn: 1,
        step: 1,
        message: { role: "tool", callId: "c9", content: "5" },
      },
    });

    // tool_result (error): error present with name/code
    expect(
      toSessionEvent({
        type: "tool_result",
        turn: 1,
        step: 1,
        result: {
          type: "tool_result",
          toolCallId: "c9",
          content: "boom",
          isError: true,
        },
      }),
    ).toEqual({
      type: "tool/result",
      data: {
        turn: 1,
        step: 1,
        message: { role: "tool", callId: "c9", content: "boom" },
        error: { name: "tool_error", code: "tool_error" },
      },
    });

    // turn_end
    expect(
      toSessionEvent({ type: "turn_end", turn: 1, reason: "completed" }),
    ).toEqual({ type: "turn/end", data: { turn: 1, reason: "completed" } });
  });

  it("(f) stream:true text-only w/ log -> same 4 events", async () => {
    const adapter = new FakeLlmAdapter([
      { message: assistantMessage([textBlock("Hello")], "stop") },
    ]);
    const tools = new ToolRegistry();
    const log = makeLog();
    const result = await runAgent(
      { adapter, tools, log, stream: true },
      "hi",
    );
    expect(result.end).toBe("completed");
    const events = log.readAll();
    expect(events.map((e) => e.type)).toEqual([
      "turn/start",
      "step/start",
      "assistant/message",
      "turn/end",
    ]);
    expect(events.map((e) => e.seq)).toEqual([0, 1, 2, 3]);
    const assistant = events[2];
    if (assistant.type === "assistant/message") {
      expect(assistant.data.message.content).toBe("Hello");
    }
  });
});
