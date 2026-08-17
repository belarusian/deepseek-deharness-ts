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
  FakeLlmAdapter,
  ToolRegistry,
  addTool,
  assistantMessage,
  textBlock,
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
});
