/**
 * Vitest coverage for the process-level launcher (TICKET-058).
 *
 * Deterministic: a `FakeLlmAdapter` + built-in tools + a temp dir via
 * `node:fs` `mkdtempSync` in `os.tmpdir()`, a fixed clock (the CLI's default
 * `() => 0`), no network / `Date.now()` in the assertions, and **injected**
 * `stdout`/`stderr` capture objects (never the real `process` streams).
 */

import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  launch,
  helpText,
  versionText,
  formatResult,
  formatResultJson,
  formatToolList,
  FakeLlmAdapter,
  ToolRegistry,
  echoTool,
  addTool,
  failTool,
  assistantMessage,
  textBlock,
  toolCallBlock,
  readLog,
  SessionLog,
  type ProgramResult,
} from "../index.js";

/** Temp dirs created by the tests, cleaned up in `afterEach`. */
const dirs: string[] = [];

/** Create a fresh temp dir (tracked for cleanup) and a log path inside it. */
function makeLogPath(): string {
  const dir = mkdtempSync(join(tmpdir(), "deharness-launcher-"));
  dirs.push(dir);
  return join(dir, "session.jsonl");
}

afterEach(() => {
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

/** An injected stream pair that captures everything written to it. */
function makeStreams() {
  const cap = { out: "", err: "" };
  const stdout = {
    write: (chunk: string): boolean => {
      cap.out += chunk;
      return true;
    },
  };
  const stderr = {
    write: (chunk: string): boolean => {
      cap.err += chunk;
      return true;
    },
  };
  return { cap, stdout, stderr };
}

/** The built-in tools the turn dispatches against. */
function makeTools(): ToolRegistry {
  const tools = new ToolRegistry();
  tools.add(addTool);
  return tools;
}

/** A `FakeLlmAdapter` scripted to a single text turn. */
function textAdapter(text: string): FakeLlmAdapter {
  return new FakeLlmAdapter([
    { message: assistantMessage([textBlock(text)], "stop") },
  ]);
}

describe("process-level launcher", () => {
  it("(a) --help returns 0, prints the usage line, and writes no log", async () => {
    const dir = mkdtempSync(join(tmpdir(), "deharness-launcher-help-"));
    dirs.push(dir);
    const { cap, stdout, stderr } = makeStreams();

    const code = await launch({ argv: ["--help"], stdout, stderr });

    expect(code).toBe(0);
    expect(cap.out).toContain("usage: deepseek");
    expect(cap.out).toContain("--session <path>");
    expect(cap.out).toContain("--max-steps <n>");
    expect(cap.out).toContain(helpText());
    // No turn ran, so no log was written into the temp dir.
    expect(readdirSync(dir)).toHaveLength(0);
  });

  it("(b) --version returns 0 and prints the version string", async () => {
    const { cap, stdout, stderr } = makeStreams();

    const code = await launch({ argv: ["--version"], stdout, stderr });

    expect(code).toBe(0);
    expect(cap.out).toContain("deepseek-deharness-ts 0.1.0");
    expect(cap.out).toContain(versionText());
  });

  it("(c) a normal turn prints the summary and exits 0, and writes the log", async () => {
    const logPath = makeLogPath();
    const { cap, stdout, stderr } = makeStreams();

    const code = await launch({
      argv: ["hello", "--session", logPath],
      adapter: textAdapter("hi there"),
      tools: makeTools(),
      stdout,
      stderr,
    });

    expect(code).toBe(0);
    expect(cap.out).toContain("completed");
    expect(cap.out).toContain(logPath);
    expect(existsSync(logPath)).toBe(true);

    const { header, events } = readLog(logPath);
    expect(header.id).toBe("session");
    expect(events.map((e) => e.type)).toEqual([
      "turn/start",
      "step/start",
      "assistant/message",
      "turn/end",
    ]);
  });

  it("(d) an error turn exits 1 and the summary reflects the error end", async () => {
    const logPath = makeLogPath();
    const { cap, stdout, stderr } = makeStreams();
    // An empty script throws on the first complete() -> runTurn contains it
    // into end: "error".
    const throwing = new FakeLlmAdapter([]);

    const code = await launch({
      argv: ["boom", "--session", logPath],
      adapter: throwing,
      tools: makeTools(),
      stdout,
      stderr,
    });

    expect(code).toBe(1);
    expect(cap.out).toContain("error");
    expect(cap.out).toContain(logPath);
    expect(cap.err).toContain("error");
    expect(existsSync(logPath)).toBe(true);
  });

  it("(e) formatResult is pure: same end/turns/steps/logPath -> identical strings", () => {
    const mk = (logPath: string): ProgramResult => ({
      result: { messages: [], turns: 1, steps: 1, end: "completed" },
      logPath,
      log: new SessionLog("e"),
    });

    const a = mk("/tmp/x.jsonl");
    const b = mk("/tmp/x.jsonl");

    expect(formatResult(a)).toBe(formatResult(b));
    expect(formatResult(a)).toContain("completed");
    expect(formatResult(a)).toContain("/tmp/x.jsonl");
    expect(formatResult(a)).toBe("completed turns=1 steps=1 log=/tmp/x.jsonl");
  });

  it("(f) launch honors opts.argv: --id/--session set the header id at the path", async () => {
    const logPath = makeLogPath();
    const { cap, stdout, stderr } = makeStreams();

    const code = await launch({
      argv: ["hi", "--id", "abc", "--session", logPath],
      adapter: textAdapter("ok"),
      tools: makeTools(),
      stdout,
      stderr,
    });

    expect(code).toBe(0);
    expect(cap.out).toContain("completed");
    expect(cap.out).toContain(logPath);
    expect(existsSync(logPath)).toBe(true);
    const { header } = readLog(logPath);
    expect(header.id).toBe("abc");
  });

  it("(g) --json prints a parseable JSON summary and exits 0", async () => {
    const logPath = makeLogPath();
    const { cap, stdout, stderr } = makeStreams();

    const code = await launch({
      argv: ["hello", "--session", logPath, "--json"],
      adapter: textAdapter("hi there"),
      tools: makeTools(),
      stdout,
      stderr,
    });

    expect(code).toBe(0);
    const parsed = JSON.parse(cap.out);
    expect(parsed.end).toBe("completed");
    expect(parsed.turns).toBe(1);
    expect(parsed.steps).toBe(1);
    expect(parsed.logPath).toBe(logPath);
    expect(existsSync(logPath)).toBe(true);
  });

  it("(h) --json on an error turn exits 1 and the JSON reflects the error end", async () => {
    const logPath = makeLogPath();
    const { cap, stdout, stderr } = makeStreams();
    const throwing = new FakeLlmAdapter([]);

    const code = await launch({
      argv: ["boom", "--session", logPath, "--json"],
      adapter: throwing,
      tools: makeTools(),
      stdout,
      stderr,
    });

    expect(code).toBe(1);
    const parsed = JSON.parse(cap.out);
    expect(parsed.end).toBe("error");
    expect(parsed.logPath).toBe(logPath);
    expect(cap.err).toContain("error");
    expect(existsSync(logPath)).toBe(true);
  });

  it("(i) --list prints the registered tools and exits 0, writing no log", async () => {
    const dir = mkdtempSync(join(tmpdir(), "deharness-launcher-list-"));
    dirs.push(dir);
    const { cap, stdout, stderr } = makeStreams();

    const tools = new ToolRegistry();
    tools.add(echoTool);
    tools.add(addTool);

    const code = await launch({
      argv: ["--list"],
      tools,
      stdout,
      stderr,
    });

    expect(code).toBe(0);
    // Each tool appears as `<name> — <description>`, in names() insertion order.
    const lines = cap.out.trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe(`${echoTool.name} — ${echoTool.description}`);
    expect(lines[1]).toBe(`${addTool.name} — ${addTool.description}`);
    expect(cap.out).toContain(echoTool.name);
    expect(cap.out).toContain(echoTool.description);
    expect(cap.out).toContain(addTool.name);
    expect(cap.out).toContain(addTool.description);
    // No turn ran, so no log was written into the temp dir.
    expect(readdirSync(dir)).toHaveLength(0);
  });

  it("(j) --list with no opts.tools prints the built-ins (echo/add/fail)", async () => {
    const { cap, stdout, stderr } = makeStreams();

    const code = await launch({
      argv: ["--list"],
      stdout,
      stderr,
    });

    expect(code).toBe(0);
    const lines = cap.out.trim().split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe(`${echoTool.name} — ${echoTool.description}`);
    expect(lines[1]).toBe(`${addTool.name} — ${addTool.description}`);
    expect(lines[2]).toBe(`${failTool.name} — ${failTool.description}`);
  });

  it("(k) formatResultJson is pure: identical inputs -> identical strings, JSON.parse yields the fields", () => {
    const mk = (logPath: string): ProgramResult => ({
      result: { messages: [], turns: 2, steps: 3, end: "max_steps" },
      logPath,
      log: new SessionLog("k"),
    });

    const a = mk("/tmp/y.jsonl");
    const b = mk("/tmp/y.jsonl");

    expect(formatResultJson(a)).toBe(formatResultJson(b));
    const parsed = JSON.parse(formatResultJson(a));
    expect(parsed).toEqual({
      end: "max_steps",
      turns: 2,
      steps: 3,
      logPath: "/tmp/y.jsonl",
    });
    // Stable key order: end, turns, steps, logPath.
    expect(formatResultJson(a)).toBe(
      JSON.stringify({ end: "max_steps", turns: 2, steps: 3, logPath: "/tmp/y.jsonl" }),
    );
  });

  it("(k2) formatToolList is pure and renders names() order with descriptions", () => {
    const tools = new ToolRegistry();
    tools.add(echoTool);
    tools.add(addTool);

    const out = formatToolList(tools);
    expect(out).toBe(
      [
        `${echoTool.name} — ${echoTool.description}`,
        `${addTool.name} — ${addTool.description}`,
      ].join("\n"),
    );
    expect(out).toBe(formatToolList(tools));
  });
});

/**
 * **E2E program run** (TICKET-070..074) — the Hardening phase's first cycle.
 *
 * These cases drive the **real** `launch` (the same entrypoint the on-PATH
 * `bin` shim calls) through a realistic multi-turn, tool-using session and
 * assert the full trajectory: the on-disk log, the printed output, the exit
 * code, and the adapter `CallOptions` it was driven with. They prove the
 * *composition* works on PATH: `launch` → `main` → `Program` → `runTurn` →
 * adapter.
 *
 * Deterministic and dependency-free: a `FakeLlmAdapter` + built-in tools + a
 * temp dir (`mkdtempSync` in `os.tmpdir()`) + the CLI's default `() => 0`
 * clock. No network, no `Date.now()`, no subprocess spawn — the `bin` shim is
 * exercised indirectly (it has no logic of its own).
 */
describe("E2E program run", () => {
  /** A `FakeLlmAdapter` scripted to a tool round-trip: request `add`, then answer. */
  function toolAdapter(): FakeLlmAdapter {
    return new FakeLlmAdapter([
      {
        message: assistantMessage(
          [toolCallBlock("call_1", "add", '{"a":1,"b":2}')],
          "tool_calls",
        ),
      },
      { message: assistantMessage([textBlock("the sum is 3")], "stop") },
    ]);
  }

  it("(a) a multi-turn tool session runs end to end: exit 0, summary, log, CallOptions", async () => {
    const logPath = makeLogPath();
    const { cap, stdout, stderr } = makeStreams();
    const adapter = toolAdapter();

    const code = await launch({
      argv: ["add them", "--session", logPath, "--model", "m1", "--max-tokens", "42"],
      adapter,
      tools: makeTools(),
      stdout,
      stderr,
    });

    // Exit code: the turn completed.
    expect(code).toBe(0);
    // Printed output: the one-line formatResult summary (plus the trailing newline).
    expect(cap.out).toBe(`completed turns=1 steps=2 log=${logPath}\n`);

    // On-disk log: well-formed header, contiguous seq, the expected event types.
    const { header, events } = readLog(logPath);
    expect(header.id).toBe("session");
    expect(header.version).toBe(0);
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
    // Contiguous seq: exactly 0..n-1 in order.
    expect(events.map((e) => e.seq)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    // The tool round-trip is recorded: the call names `add`, the result is "3".
    const call = events.find((e) => e.type === "tool/call");
    expect(call?.data.name).toBe("add");
    const result = events.find((e) => e.type === "tool/result");
    expect(result?.data.message.content).toBe("3");

    // The adapter was driven with the threaded CallOptions on both steps.
    expect(adapter.callOptions).toHaveLength(2);
    for (const opts of adapter.callOptions) {
      expect(opts?.model).toBe("m1");
      expect(opts?.maxTokens).toBe(42);
    }
  });

  it("(b) the same session with --json prints a parseable JSON summary and exits 0", async () => {
    const logPath = makeLogPath();
    const { cap, stdout, stderr } = makeStreams();

    const code = await launch({
      argv: ["add them", "--session", logPath, "--json"],
      adapter: toolAdapter(),
      tools: makeTools(),
      stdout,
      stderr,
    });

    expect(code).toBe(0);
    const parsed = JSON.parse(cap.out);
    expect(parsed).toEqual({
      end: "completed",
      turns: 1,
      steps: 2,
      logPath,
    });
    // The on-disk log is still written and well-formed.
    const { events } = readLog(logPath);
    expect(events.map((e) => e.seq)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it("(c) an error turn (exhausted adapter) exits 1 and the log records turn/end reason error", async () => {
    const logPath = makeLogPath();
    const { cap, stdout, stderr } = makeStreams();
    // An empty script throws on the first complete() -> runTurn contains it
    // into end: "error".
    const throwing = new FakeLlmAdapter([]);

    const code = await launch({
      argv: ["boom", "--session", logPath],
      adapter: throwing,
      tools: makeTools(),
      stdout,
      stderr,
    });

    expect(code).toBe(1);
    expect(cap.out).toBe(`error turns=1 steps=1 log=${logPath}\n`);
    expect(cap.err).toContain("error");
    // The log still records the turn, ending with reason "error".
    const { events } = readLog(logPath);
    expect(events.map((e) => e.type)).toEqual([
      "turn/start",
      "step/start",
      "turn/end",
    ]);
    const end = events.find((e) => e.type === "turn/end");
    expect(end?.data.reason).toBe("error");
  });

  it("(d) resume: two launch calls yield contiguous seq across both turns and an unchanged header id", async () => {
    const logPath = makeLogPath();
    const { cap: cap1, stdout: s1, stderr: e1 } = makeStreams();
    const { cap: cap2, stdout: s2, stderr: e2 } = makeStreams();

    // First turn: a fresh session at the path, id "abc".
    const code1 = await launch({
      argv: ["hi", "--session", logPath, "--id", "abc"],
      adapter: textAdapter("ok"),
      tools: makeTools(),
      stdout: s1,
      stderr: e1,
    });
    expect(code1).toBe(0);
    expect(cap1.out).toBe(`completed turns=1 steps=1 log=${logPath}\n`);

    // Second turn: resume the same session.
    const code2 = await launch({
      argv: ["hi again", "--session", logPath, "--id", "abc", "--resume"],
      adapter: textAdapter("ok again"),
      tools: makeTools(),
      stdout: s2,
      stderr: e2,
    });
    expect(code2).toBe(0);
    expect(cap2.out).toBe(`completed turns=1 steps=1 log=${logPath}\n`);

    // The on-disk log has 8 events with contiguous seq across both turns,
    // and the header id is unchanged.
    const { header, events } = readLog(logPath);
    expect(header.id).toBe("abc");
    expect(events.map((e) => e.seq)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(events.map((e) => e.type)).toEqual([
      "turn/start",
      "step/start",
      "assistant/message",
      "turn/end",
      "turn/start",
      "step/start",
      "assistant/message",
      "turn/end",
    ]);
  });
});
