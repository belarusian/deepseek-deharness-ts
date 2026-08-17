import { describe, it, expect } from "vitest";
import {
  Conversation,
  ToolRegistry,
  addTool,
  FakeLlmAdapter,
  assistantMessage,
  textBlock,
  toolCallBlock,
  message,
  type LlmAdapter,
  type ContentBlock,
  type Message,
} from "../index.js";

/** A scripted fake adapter over a queue of assistant messages. */
function fakeAdapter(
  messages: readonly (readonly ContentBlock[])[],
): FakeLlmAdapter {
  return new FakeLlmAdapter(
    messages.map((blocks) => ({ message: assistantMessage(blocks) })),
  );
}

describe("Conversation", () => {
  it("(a) two text-only turns -> turns 2, both completed, history [user, assistant, user, assistant]", async () => {
    const adapter = fakeAdapter([[textBlock("one")], [textBlock("two")]]);
    const tools = new ToolRegistry();
    const conv = new Conversation({ adapter, tools });
    const r1 = await conv.send("first");
    const r2 = await conv.send("second");
    expect(conv.turns).toBe(2);
    expect(r1.end).toBe("completed");
    expect(r2.end).toBe("completed");
    expect(r1.turns).toBe(1);
    expect(r2.turns).toBe(2);
    expect(conv.history().map((m) => m.role)).toEqual([
      "user",
      "assistant",
      "user",
      "assistant",
    ]);
  });

  it("(a2) two text-only turns with a system prompt -> leading system message", async () => {
    const adapter = fakeAdapter([[textBlock("one")], [textBlock("two")]]);
    const tools = new ToolRegistry();
    const conv = new Conversation({ adapter, tools, system: "be brief" });
    await conv.send("first");
    await conv.send("second");
    expect(conv.history().map((m) => m.role)).toEqual([
      "system",
      "user",
      "assistant",
      "user",
      "assistant",
    ]);
  });

  it("(b) transcript persists across turns: turn-1 tool round-trip, turn-2 text", async () => {
    const adapter = new FakeLlmAdapter([
      {
        message: assistantMessage(
          [toolCallBlock("c1", "add", '{"a":2,"b":3}')],
          "tool_calls",
        ),
      },
      { message: assistantMessage([textBlock("five")], "stop") },
      { message: assistantMessage([textBlock("again")], "stop") },
    ]);
    const tools = new ToolRegistry();
    tools.add(addTool);
    const conv = new Conversation({ adapter, tools });
    const r1 = await conv.send("add 2 and 3");
    const r2 = await conv.send("what was it?");
    expect(r1.end).toBe("completed");
    expect(r2.end).toBe("completed");
    const roles = conv.history().map((m) => m.role);
    expect(roles).toEqual([
      "user",
      "assistant",
      "tool",
      "assistant",
      "user",
      "assistant",
    ]);
    // The turn-1 tool message sits before the turn-2 assistant message.
    const toolIdx = roles.indexOf("tool");
    const turn2AssistantIdx = roles.lastIndexOf("assistant");
    expect(toolIdx).toBeLessThan(turn2AssistantIdx);
    // The tool result content is the add(2,3) sum.
    const toolMsg = conv.history()[2];
    const block = toolMsg.blocks[0];
    expect(block.type).toBe("tool_result");
    if (block.type === "tool_result") {
      expect(block.content).toBe("5");
      expect(block.toolCallId).toBe("c1");
    }
  });

  it("(c) maxSteps within a turn -> 'max_steps', then a subsequent send() recovers", async () => {
    const adapter = new FakeLlmAdapter([
      {
        message: assistantMessage(
          [toolCallBlock("c", "add", '{"a":1,"b":1}')],
          "tool_calls",
        ),
      },
      {
        message: assistantMessage(
          [toolCallBlock("c", "add", '{"a":1,"b":1}')],
          "tool_calls",
        ),
      },
      {
        message: assistantMessage(
          [toolCallBlock("c", "add", '{"a":1,"b":1}')],
          "tool_calls",
        ),
      },
      { message: assistantMessage([textBlock("done")], "stop") },
    ]);
    const tools = new ToolRegistry();
    tools.add(addTool);
    const conv = new Conversation({ adapter, tools, maxSteps: 3 });
    const r1 = await conv.send("loop");
    expect(r1.end).toBe("max_steps");
    expect(r1.steps).toBe(3);
    expect(r1.turns).toBe(1);
    // The conversation is still usable: the next turn consumes the text reply.
    const r2 = await conv.send("again");
    expect(r2.end).toBe("completed");
    expect(r2.turns).toBe(2);
    expect(conv.turns).toBe(2);
  });

  it("(d) error containment: a throwing turn -> 'error', then the conversation recovers", async () => {
    let calls = 0;
    const adapter: LlmAdapter = {
      complete: async () => {
        calls++;
        if (calls === 1) throw new Error("boom");
        return assistantMessage([textBlock("recovered")], "stop");
      },
      stream: () => {
        throw new Error("not used");
      },
    };
    const tools = new ToolRegistry();
    const conv = new Conversation({ adapter, tools });
    const r1 = await conv.send("first");
    expect(r1.end).toBe("error");
    // The step started (step_start emitted, steps set to 1) before the adapter
    // threw, so the failed turn counts as 1 step (only the abort path leaves
    // steps at 0, since it breaks before steps is assigned).
    expect(r1.steps).toBe(1);
    // The conversation survives the failed turn and continues.
    const r2 = await conv.send("second");
    expect(r2.end).toBe("completed");
    expect(r2.turns).toBe(2);
    expect(conv.turns).toBe(2);
  });

  it("(e) abort: pre-aborted signal -> 'aborted', steps 0, conversation stays total", async () => {
    const adapter = fakeAdapter([[textBlock("never")]]);
    const tools = new ToolRegistry();
    const controller = new AbortController();
    controller.abort();
    const conv = new Conversation({ adapter, tools, signal: controller.signal });
    const r1 = await conv.send("hi");
    expect(r1.end).toBe("aborted");
    expect(r1.steps).toBe(0);
    // The user message was appended before the abort check; no assistant reply.
    expect(conv.history().map((m) => m.role)).toEqual(["user"]);
    // The conversation stays usable: a further send() is total (no throw). The
    // signal is fixed in opts and remains aborted, so the turn aborts again.
    const r2 = await conv.send("again");
    expect(r2.end).toBe("aborted");
    expect(r2.steps).toBe(0);
    expect(conv.history().map((m) => m.role)).toEqual(["user", "user"]);
  });

  it("(f) history() immutability: mutating the returned array does not affect the conversation", async () => {
    const adapter = fakeAdapter([[textBlock("one")]]);
    const tools = new ToolRegistry();
    const conv = new Conversation({ adapter, tools });
    await conv.send("first");
    const before = conv.history();
    expect(before.length).toBe(2);
    const snapshot = [...before];
    // The returned array is a fresh copy: mutate it freely (cast away the
    // readonly type guard — the runtime array is a new, mutable array).
    const mutable = before as Message[];
    mutable.push(message("user", [textBlock("injected")]));
    mutable.splice(0, 1);
    // A later history() is unchanged.
    const after = conv.history();
    expect(after.length).toBe(2);
    expect(after.map((m) => m.role)).toEqual(snapshot.map((m) => m.role));
  });
});
