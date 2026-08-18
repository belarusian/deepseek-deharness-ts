/**
 * Vitest coverage for the on-disk Program + CLI (TICKET-053).
 *
 * Deterministic: a `FakeLlmAdapter` + built-in tools + a temp dir via
 * `node:fs` `mkdtempSync` in `os.tmpdir()`, a fixed `clock`, no network /
 * `Date.now()`.
 */

import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  Program,
  main,
  FakeLlmAdapter,
  ToolRegistry,
  addTool,
  assistantMessage,
  textBlock,
  toolCallBlock,
  readLog,
  SESSION_FORMAT_VERSION,
  type LlmAdapter,
  type Message,
  type AgentEvent,
  type CallOptions,
  type LlmStream,
} from "../index.js";
import type { AssistantMessage as LlmAssistantMessage } from "../llm/index.js";

/** A deterministic clock pinned to a constant so `time` is stable. */
const T0 = 1_700_000_000_000;

/** Temp dirs created by the tests, cleaned up in `afterEach`. */
const dirs: string[] = [];

/** Create a fresh temp dir (tracked for cleanup) and a log path inside it. */
function makeLogPath(): string {
  const dir = mkdtempSync(join(tmpdir(), "deharness-program-"));
  dirs.push(dir);
  return join(dir, "session.jsonl");
}

afterEach(() => {
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * A recording `LlmAdapter` wrapper: captures every transcript it is called
 * with (so a test can assert what the model saw), then delegates to an inner
 * adapter.
 */
class RecordingAdapter implements LlmAdapter {
  readonly calls: Message[][] = [];
  constructor(private readonly inner: LlmAdapter) {}
  async complete(
    messages: readonly Message[],
    opts?: CallOptions,
  ): Promise<LlmAssistantMessage> {
    this.calls.push([...messages]);
    return this.inner.complete(messages, opts);
  }
  stream(messages: readonly Message[], opts?: CallOptions): LlmStream {
    this.calls.push([...messages]);
    return this.inner.stream(messages, opts);
  }
}

describe("on-disk Program (four-algebra composition)", () => {
  it("(a) run persists the log: text-only turn -> 4 events, seq 0-3, well-formed header", async () => {
    const logPath = makeLogPath();
    const adapter = new FakeLlmAdapter([
      { message: assistantMessage([textBlock("hi there")], "stop") },
    ]);
    const tools = new ToolRegistry();
    const program = new Program({
      adapter,
      tools,
      sessionId: "sess-a",
      logPath,
      clock: () => T0,
    });

    const res = await program.run("hello");
    expect(res.result.end).toBe("completed");
    expect(res.logPath).toBe(logPath);
    expect(existsSync(logPath)).toBe(true);

    const { header, events } = readLog(logPath);
    expect(header.id).toBe("sess-a");
    expect(header.version).toBe(SESSION_FORMAT_VERSION);
    expect(events.map((e) => e.type)).toEqual([
      "turn/start",
      "step/start",
      "assistant/message",
      "turn/end",
    ]);
    expect(events.map((e) => e.seq)).toEqual([0, 1, 2, 3]);
  });

  it("(b) resume continues with contiguous seq: two text turns -> 8 events, seq 0-7, header id unchanged", async () => {
    const logPath = makeLogPath();
    const adapter = new FakeLlmAdapter([
      { message: assistantMessage([textBlock("one")], "stop") },
      { message: assistantMessage([textBlock("two")], "stop") },
    ]);
    const tools = new ToolRegistry();
    const program = new Program({
      adapter,
      tools,
      sessionId: "sess-b",
      logPath,
      clock: () => T0,
    });

    await program.run("first");
    await program.resume();
    await program.run("second");

    const { header, events } = readLog(logPath);
    expect(header.id).toBe("sess-b");
    expect(events).toHaveLength(8);
    expect(events.map((e) => e.seq)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it("(c) resume seeds the transcript: maxSteps:1 tool turn, then resumed text turn sees the prior round-trip", async () => {
    const logPath = makeLogPath();
    const inner = new FakeLlmAdapter([
      {
        message: assistantMessage(
          [toolCallBlock("c1", "add", '{"a":2,"b":3}')],
          "tool_calls",
        ),
      },
      { message: assistantMessage([textBlock("the sum is 5")], "stop") },
    ]);
    const recording = new RecordingAdapter(inner);
    const tools = new ToolRegistry();
    tools.add(addTool);
    const program = new Program({
      adapter: recording,
      tools,
      sessionId: "sess-c",
      logPath,
      maxSteps: 1,
      clock: () => T0,
    });

    await program.run("add 2 and 3");
    await program.resume();
    await program.run("now answer");

    const { events } = readLog(logPath);
    // turn 1 (maxSteps:1): turn/start, step/start, assistant, tool/call,
    // tool/result, turn/end (6); turn 2: turn/start, step/start, assistant,
    // turn/end (4).
    expect(events.map((e) => e.type)).toEqual([
      "turn/start",
      "step/start",
      "assistant/message",
      "tool/call",
      "tool/result",
      "turn/end",
      "turn/start",
      "step/start",
      "assistant/message",
      "turn/end",
    ]);
    expect(events).toHaveLength(10);

    // The second turn's assistant message is the scripted text.
    const secondAssistant = events[8];
    expect(secondAssistant.type).toBe("assistant/message");
    if (secondAssistant.type === "assistant/message") {
      expect(secondAssistant.data.message.content).toBe("the sum is 5");
    }

    // The resumed turn's transcript was seeded with the prior round-trip:
    // assistant (tool-call, flattened to "") + tool result + the new user msg.
    const lastCall = recording.calls[recording.calls.length - 1];
    expect(lastCall.map((m) => m.role)).toEqual(["assistant", "tool", "user"]);
  });

  it("(d) callOptions drives the adapter: model + maxTokens reach the adapter call (tools projection wins)", async () => {
    const logPath = makeLogPath();
    const adapter = new FakeLlmAdapter([
      { message: assistantMessage([textBlock("hi")], "stop") },
    ]);
    const tools = new ToolRegistry();
    tools.add(addTool);
    const program = new Program({
      adapter,
      tools,
      sessionId: "sess-d",
      logPath,
      callOptions: { model: "m1", maxTokens: 42 },
      clock: () => T0,
    });

    const res = await program.run("hello");
    expect(res.result.end).toBe("completed");

    // The adapter was called with the caller's model/maxTokens, and the loop's
    // projected tools (the authoritative tool list for the turn).
    const last = adapter.lastCallOptions;
    expect(last).toBeDefined();
    expect(last?.model).toBe("m1");
    expect(last?.maxTokens).toBe(42);
    expect(last?.tools).toHaveLength(1);
    expect(last?.tools?.[0]?.name).toBe("add");
  });

  it("(e) no callOptions drives the adapter with {tools} only (default path unchanged)", async () => {
    const logPath = makeLogPath();
    const adapter = new FakeLlmAdapter([
      { message: assistantMessage([textBlock("hi")], "stop") },
    ]);
    const tools = new ToolRegistry();
    tools.add(addTool);
    const program = new Program({
      adapter,
      tools,
      sessionId: "sess-e",
      logPath,
      clock: () => T0,
    });

    const res = await program.run("hello");
    expect(res.result.end).toBe("completed");

    // No model/maxTokens threaded; the call still carries the projected tools.
    const last = adapter.lastCallOptions;
    expect(last).toBeDefined();
    expect(last?.model).toBeUndefined();
    expect(last?.maxTokens).toBeUndefined();
    expect(last?.tools).toHaveLength(1);
    expect(last?.tools?.[0]?.name).toBe("add");
  });
  it("(f) onEvent emits the AgentEvent stream to the sink (inner spoke)", async () => {
    const logPath = makeLogPath();
    const adapter = new FakeLlmAdapter([
      { message: assistantMessage([textBlock("hi there")], "stop") },
    ]);
    const tools = new ToolRegistry();
    const events: AgentEvent[] = [];
    const program = new Program({
      adapter,
      tools,
      sessionId: "sess-on",
      logPath,
      clock: () => T0,
      onEvent: (e) => {
        events.push(e);
      },
    });

    const res = await program.run("hello");
    expect(res.result.end).toBe("completed");
    // The sink received the inner-spoke AgentEvent stream, in order.
    expect(events.map((e) => e.type)).toEqual([
      "turn_start",
      "step_start",
      "assistant",
      "turn_end",
    ]);
    expect(events.every((e) => e.turn === 1)).toBe(true);
    const end = events.find(
      (e): e is Extract<AgentEvent, { type: "turn_end" }> => e.type === "turn_end",
    );
    expect(end?.reason).toBe("completed");
  });

  it("(g) no onEvent leaves the sink absent (default path unchanged)", async () => {
    const logPath = makeLogPath();
    const adapter = new FakeLlmAdapter([
      { message: assistantMessage([textBlock("hi there")], "stop") },
    ]);
    const tools = new ToolRegistry();
    const program = new Program({
      adapter,
      tools,
      sessionId: "sess-no",
      logPath,
      clock: () => T0,
    });

    const res = await program.run("hello");
    expect(res.result.end).toBe("completed");
    // The log is still written and well-formed (the outer spoke is unaffected).
    const { events } = readLog(logPath);
    expect(events.map((e) => e.type)).toEqual([
      "turn/start",
      "step/start",
      "assistant/message",
      "turn/end",
    ]);
    expect(events.map((e) => e.seq)).toEqual([0, 1, 2, 3]);
  });

});

describe("on-PATH program CLI", () => {
  it("(d) main runs a turn: returns a completed ProgramResult and writes the log", async () => {
    const logPath = makeLogPath();
    const adapter = new FakeLlmAdapter([
      { message: assistantMessage([textBlock("ok")], "stop") },
    ]);

    const res = await main(["hello"], { adapter, logPath });
    expect(res.result.end).toBe("completed");
    expect(res.logPath).toBe(logPath);
    expect(existsSync(logPath)).toBe(true);

    const { events } = readLog(logPath);
    expect(events).toHaveLength(4);
  });

  it("(e) CLI flags parse: --session/--id/--max-steps set the header id and cap the turn", async () => {
    const logPath = makeLogPath();
    const adapter = new FakeLlmAdapter([
      {
        message: assistantMessage(
          [toolCallBlock("c1", "add", '{"a":1,"b":1}')],
          "tool_calls",
        ),
      },
      {
        message: assistantMessage(
          [toolCallBlock("c2", "add", '{"a":1,"b":1}')],
          "tool_calls",
        ),
      },
    ]);

    const res = await main(
      ["hi", "--session", logPath, "--id", "abc", "--max-steps", "2"],
      { adapter },
    );
    expect(res.result.end).toBe("max_steps");

    const { header, events } = readLog(logPath);
    expect(header.id).toBe("abc");
    const last = events[events.length - 1];
    expect(last.type).toBe("turn/end");
    if (last.type === "turn/end") {
      expect(last.data.reason).toBe("max_steps");
    }
  });

  it("(f) CLI resume: two main() calls (second --resume) -> 8 events, contiguous seq", async () => {
    const logPath = makeLogPath();
    const adapter1 = new FakeLlmAdapter([
      { message: assistantMessage([textBlock("one")], "stop") },
    ]);
    await main(["one"], { adapter: adapter1, logPath });

    const adapter2 = new FakeLlmAdapter([
      { message: assistantMessage([textBlock("two")], "stop") },
    ]);
    await main(["two", "--resume"], { adapter: adapter2, logPath });

    const { events } = readLog(logPath);
    expect(events).toHaveLength(8);
    expect(events.map((e) => e.seq)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });
  it("(g) --model + --max-tokens are parsed and reach the adapter", async () => {
    const logPath = makeLogPath();
    const adapter = new FakeLlmAdapter([
      { message: assistantMessage([textBlock("ok")], "stop") },
    ]);

    const res = await main(
      ["hi", "--model", "m1", "--max-tokens", "42", "--session", logPath],
      { adapter },
    );
    expect(res.result.end).toBe("completed");

    const last = adapter.lastCallOptions;
    expect(last).toBeDefined();
    expect(last?.model).toBe("m1");
    expect(last?.maxTokens).toBe(42);
  });

  it("(h) no flags -> no callOptions (default path unchanged)", async () => {
    const logPath = makeLogPath();
    const adapter = new FakeLlmAdapter([
      { message: assistantMessage([textBlock("ok")], "stop") },
    ]);

    const res = await main(["hi", "--session", logPath], { adapter });
    expect(res.result.end).toBe("completed");

    // The adapter was still called (with the projected tools), but with no
    // model/maxTokens threaded — the default path is unchanged.
    const last = adapter.lastCallOptions;
    expect(last).toBeDefined();
    expect(last?.model).toBeUndefined();
    expect(last?.maxTokens).toBeUndefined();
  });

  it("(i) opts.model / opts.maxTokens (no argv flags) reach the adapter", async () => {
    const logPath = makeLogPath();
    const adapter = new FakeLlmAdapter([
      { message: assistantMessage([textBlock("ok")], "stop") },
    ]);

    const res = await main(["hi", "--session", logPath], {
      adapter,
      model: "m2",
      maxTokens: 7,
    });
    expect(res.result.end).toBe("completed");

    const last = adapter.lastCallOptions;
    expect(last).toBeDefined();
    expect(last?.model).toBe("m2");
    expect(last?.maxTokens).toBe(7);
  });
});

describe("Program multi-turn (in-memory)", () => {
  it("(a) consecutive run accumulates context: second turn sees the first turn's messages", async () => {
    const logPath = makeLogPath();
    const adapter = new FakeLlmAdapter([
      { message: assistantMessage([textBlock("one")], "stop") },
      { message: assistantMessage([textBlock("two")], "stop") },
    ]);
    const tools = new ToolRegistry();
    const program = new Program({
      adapter,
      tools,
      sessionId: "mt-a",
      logPath,
      clock: () => T0,
    });

    await program.run("first");
    await program.run("second");

    // The accumulated transcript: user(first), assistant(one), user(second),
    // assistant(two) — the second turn saw the first turn's messages.
    expect(program.history().map((m) => m.role)).toEqual([
      "user",
      "assistant",
      "user",
      "assistant",
    ]);
  });

  it("(b) turns is cumulative: 1 after the first run, 2 after the second", async () => {
    const logPath = makeLogPath();
    const adapter = new FakeLlmAdapter([
      { message: assistantMessage([textBlock("one")], "stop") },
      { message: assistantMessage([textBlock("two")], "stop") },
    ]);
    const tools = new ToolRegistry();
    const program = new Program({
      adapter,
      tools,
      sessionId: "mt-b",
      logPath,
      clock: () => T0,
    });

    const first = await program.run("first");
    expect(first.result.turns).toBe(1);
    const second = await program.run("second");
    expect(second.result.turns).toBe(2);
  });

  it("(c) history() returns a copy: mutating it does not affect the Program", async () => {
    const logPath = makeLogPath();
    const adapter = new FakeLlmAdapter([
      { message: assistantMessage([textBlock("one")], "stop") },
    ]);
    const tools = new ToolRegistry();
    const program = new Program({
      adapter,
      tools,
      sessionId: "mt-c",
      logPath,
      clock: () => T0,
    });

    await program.run("first");
    const snapshot = program.history();
    expect(snapshot).toHaveLength(2);
    (snapshot as Message[]).push(
      { role: "user", content: "injected" } as unknown as Message,
    );
    // The persistent transcript is unaffected by the mutation.
    expect(program.history()).toHaveLength(2);
  });

  it("(d) single-turn regression: turns===1, roles [system, user, assistant], log written", async () => {
    const logPath = makeLogPath();
    const adapter = new FakeLlmAdapter([
      { message: assistantMessage([textBlock("hi")], "stop") },
    ]);
    const tools = new ToolRegistry();
    const program = new Program({
      adapter,
      tools,
      sessionId: "mt-d",
      logPath,
      system: "be brief",
      clock: () => T0,
    });

    const res = await program.run("hello");
    expect(res.result.turns).toBe(1);
    expect(res.result.end).toBe("completed");
    expect(program.history().map((m) => m.role)).toEqual([
      "system",
      "user",
      "assistant",
    ]);
    expect(existsSync(logPath)).toBe(true);
    const { events } = readLog(logPath);
    expect(events.map((e) => e.type)).toEqual([
      "turn/start",
      "step/start",
      "assistant/message",
      "turn/end",
    ]);
    expect(events.map((e) => e.seq)).toEqual([0, 1, 2, 3]);
  });

  it("(e) resume after in-memory accumulation: contiguous seq, second turn carries turn index 2", async () => {
    const logPath = makeLogPath();
    const adapter = new FakeLlmAdapter([
      { message: assistantMessage([textBlock("one")], "stop") },
      { message: assistantMessage([textBlock("two")], "stop") },
    ]);
    const tools = new ToolRegistry();
    const program = new Program({
      adapter,
      tools,
      sessionId: "mt-e",
      logPath,
      clock: () => T0,
    });

    await program.run("first");
    await program.resume();
    await program.run("second");

    const { events } = readLog(logPath);
    expect(events).toHaveLength(8);
    expect(events.map((e) => e.seq)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    // The second turn's trajectory events carry turn index 2, not 1.
    const secondTurnStart = events[4];
    expect(secondTurnStart.type).toBe("turn/start");
    if (secondTurnStart.type === "turn/start") {
      expect(secondTurnStart.data.turn).toBe(2);
    }
  });

  it("(f) resume resets the turn count: a fresh run after resume is turn 2", async () => {
    const logPath = makeLogPath();
    const adapter = new FakeLlmAdapter([
      { message: assistantMessage([textBlock("one")], "stop") },
      { message: assistantMessage([textBlock("two")], "stop") },
    ]);
    const tools = new ToolRegistry();
    const program = new Program({
      adapter,
      tools,
      sessionId: "mt-f",
      logPath,
      clock: () => T0,
    });

    await program.run("first");
    await program.resume();
    const res = await program.run("second");
    // resume() set turnCount from the seed (one turn/start), so this run is
    // the second trajectory turn.
    expect(res.result.turns).toBe(2);
  });

  it("(g) system prompt persists across in-memory turns: exactly one leading system", async () => {
    const logPath = makeLogPath();
    const adapter = new FakeLlmAdapter([
      { message: assistantMessage([textBlock("one")], "stop") },
      { message: assistantMessage([textBlock("two")], "stop") },
    ]);
    const tools = new ToolRegistry();
    const program = new Program({
      adapter,
      tools,
      sessionId: "mt-g",
      logPath,
      system: "be brief",
      clock: () => T0,
    });

    await program.run("first");
    await program.run("second");

    const roles = program.history().map((m) => m.role);
    expect(roles).toEqual([
      "system",
      "user",
      "assistant",
      "user",
      "assistant",
    ]);
    // Exactly one leading system message (not one per turn).
    expect(roles.filter((r) => r === "system")).toHaveLength(1);
  });
});
