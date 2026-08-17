import { describe, it, expect } from "vitest";
import {
  runAgent,
  ToolRegistry,
  addTool,
  FakeLlmAdapter,
  assistantMessage,
  textBlock,
  toolCallBlock,
  type AgentEvent,
  type ContentBlock,
} from "../index.js";

/** A scripted fake adapter over a queue of assistant messages. */
function fakeAdapter(messages: readonly (readonly ContentBlock[])[]): FakeLlmAdapter {
  return new FakeLlmAdapter(
    messages.map((blocks) => ({ message: assistantMessage(blocks) })),
  );
}

describe("runAgent", () => {
  it("(a) text-only turn -> end 'completed', steps 1, transcript [user, assistant]", async () => {
    const adapter = fakeAdapter([[textBlock("hello")]]);
    const tools = new ToolRegistry();
    const result = await runAgent({ adapter, tools }, "hi");
    expect(result.end).toBe("completed");
    expect(result.steps).toBe(1);
    expect(result.turns).toBe(1);
    expect(result.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
  });

  it("(b) tool round-trip: add(2,3) -> '5', then text reply -> completed", async () => {
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
    const result = await runAgent({ adapter, tools }, "add 2 and 3");
    expect(result.end).toBe("completed");
    expect(result.messages.map((m) => m.role)).toEqual([
      "user",
      "assistant",
      "tool",
      "assistant",
    ]);
    const toolMsg = result.messages[2];
    const block = toolMsg.blocks[0];
    expect(block.type).toBe("tool_result");
    if (block.type === "tool_result") {
      expect(block.content).toBe("5");
      expect(block.toolCallId).toBe("c1");
    }
    expect(toolMsg.callId).toBe("c1");
  });

  it("(c) maxSteps: adapter always returns a tool_call; maxSteps:3 -> end 'max_steps', steps 3", async () => {
    const adapter = new FakeLlmAdapter(
      Array.from({ length: 5 }, () => ({
        message: assistantMessage(
          [toolCallBlock("c", "add", '{"a":1,"b":1}')],
          "tool_calls",
        ),
      })),
    );
    const tools = new ToolRegistry();
    tools.add(addTool);
    const result = await runAgent({ adapter, tools, maxSteps: 3 }, "loop");
    expect(result.end).toBe("max_steps");
    expect(result.steps).toBe(3);
  });

  it("(d) unknown tool: contained into isError result, then text reply -> completed", async () => {
    const adapter = new FakeLlmAdapter([
      {
        message: assistantMessage(
          [toolCallBlock("c1", "nope", "{}")],
          "tool_calls",
        ),
      },
      { message: assistantMessage([textBlock("ok")], "stop") },
    ]);
    const tools = new ToolRegistry();
    const result = await runAgent({ adapter, tools }, "call nope");
    expect(result.end).toBe("completed");
    const toolMsg = result.messages[2];
    const block = toolMsg.blocks[0];
    expect(block.type).toBe("tool_result");
    if (block.type === "tool_result") {
      expect(block.isError).toBe(true);
      expect(block.content).toBe("unknown tool: nope");
    }
  });

  it("(e) abort: pre-aborted AbortSignal -> end 'aborted'", async () => {
    const adapter = fakeAdapter([[textBlock("never")]]);
    const tools = new ToolRegistry();
    const controller = new AbortController();
    controller.abort();
    const result = await runAgent(
      { adapter, tools, signal: controller.signal },
      "hi",
    );
    expect(result.end).toBe("aborted");
    expect(result.steps).toBe(0);
  });

  it("(f) trajectory: onEvent called in order turn_start, step_start, assistant, ..., turn_end", async () => {
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
    const events: AgentEvent[] = [];
    await runAgent(
      { adapter, tools, onEvent: (e) => events.push(e) },
      "add 2 and 3",
    );
    const types = events.map((e) => e.type);
    expect(types).toEqual([
      "turn_start",
      "step_start",
      "assistant",
      "tool_call",
      "tool_result",
      "step_start",
      "assistant",
      "turn_end",
    ]);
    expect(events[0]).toEqual({ type: "turn_start", turn: 1 });
    expect(events[events.length - 1]).toEqual({
      type: "turn_end",
      turn: 1,
      reason: "completed",
    });
  });
});
