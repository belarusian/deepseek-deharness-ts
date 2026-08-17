import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SESSION_FORMAT_VERSION } from "../session/event.js";
import { isLosslessJson, SessionLog } from "../session/log.js";
import {
  deserializeLog,
  encodeSegment,
  readLog,
  serializeLog,
  writeLog,
} from "../session/store.js";

const T0 = 1_700_000_000_000;
const makeLog = (): SessionLog => new SessionLog("sess-1", { clock: () => T0 });

describe("SessionLog", () => {
  it("assigns contiguous seq with an injectable clock", () => {
    const log = makeLog();
    const a = log.append("turn/start", { turn: 1 });
    const b = log.append("step/start", { turn: 1, step: 1 });
    expect(a.seq).toBe(0);
    expect(b.seq).toBe(1);
    expect(a.time).toBe(T0);
    expect(log.seq).toBe(2);
  });

  it("supports readAll, since, and last", () => {
    const log = makeLog();
    log.append("turn/start", { turn: 1 });
    log.append("turn/end", { turn: 1, reason: "done" });
    expect(log.readAll()).toHaveLength(2);
    expect(log.since(1).map((e) => e.type)).toEqual(["turn/end"]);
    expect(log.last()?.type).toBe("turn/end");
    expect(makeLog().last()).toBeUndefined();
  });

  it("detaches event data from the caller's mutable input", () => {
    const log = makeLog();
    const input = { turn: 1, step: 1, callId: "c1", name: "bash", arguments: "{}" };
    log.append("tool/call", input);
    (input as { name: string }).name = "mutated";
    expect(log.readAll()[0].data).toMatchObject({ name: "bash" });
  });

  it("rejects non-lossless-JSON data", () => {
    const log = makeLog();
    expect(() =>
      log.append("turn/end", { turn: 1, reason: 1 / 0 } as never),
    ).toThrow(/lossless/);
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() =>
      log.append("assistant/message", {
        turn: 1,
        step: 1,
        message: { role: "assistant", content: "x" },
        usage: circular as never,
      }),
    ).toThrow(/lossless/);
  });

  it("stamps the default header with format version and id", () => {
    const log = makeLog();
    expect(log.header.version).toBe(SESSION_FORMAT_VERSION);
    expect(log.header.id).toBe("sess-1");
  });

  it("preserves seed events and continues seq after them", () => {
    const seedLog = makeLog();
    seedLog.append("turn/start", { turn: 1 });
    seedLog.append("turn/end", { turn: 1, reason: "done" });
    const child = new SessionLog("sess-2", {
      clock: () => T0,
      seed: seedLog.readAll(),
      header: {
        version: SESSION_FORMAT_VERSION,
        id: "sess-2",
        createdAt: T0,
        parentSession: "sess-1",
        seedLength: 2,
      },
    });
    const next = child.append("turn/start", { turn: 2 });
    expect(child.readAll()).toHaveLength(3);
    expect(next.seq).toBe(2);
    expect(child.header.parentSession).toBe("sess-1");
  });

  it("applies surface intent only where given", () => {
    const log = makeLog();
    const e = log.append(
      "user/message",
      { role: "user", content: "hi" },
      { surfaceOp: "append", sourceEventSeqs: [] },
    );
    expect(e.surfaceOp).toBe("append");
    expect(e.sourceEventSeqs).toEqual([]);
    log.append("turn/start", { turn: 1 });
    expect(log.readAll()[1].surfaceOp).toBeUndefined();
  });
});

describe("isLosslessJson", () => {
  it("accepts plain JSON values", () => {
    expect(isLosslessJson({ a: [1, "two", null, { b: false }] })).toBe(true);
  });

  it("rejects bigint, undefined, functions, NaN, and cycles", () => {
    expect(isLosslessJson({ a: 1n })).toBe(false);
    expect(isLosslessJson({ a: undefined })).toBe(false);
    expect(isLosslessJson({ a: () => 1 })).toBe(false);
    expect(isLosslessJson(NaN)).toBe(false);
    const o: Record<string, unknown> = {};
    o.self = o;
    expect(isLosslessJson(o)).toBe(false);
  });
});

describe("store", () => {
  it("round-trips through serializeLog/deserializeLog", () => {
    const log = makeLog();
    log.append("turn/start", { turn: 1 });
    log.append("user/message", { role: "user", content: "hello" });
    const text = serializeLog(log);
    expect(text.endsWith("\n")).toBe(true);
    const { header, events } = deserializeLog(text);
    expect(header.id).toBe("sess-1");
    expect(events).toHaveLength(2);
    expect(events[1].data).toEqual({ role: "user", content: "hello" });
  });

  it("drops a torn final line without a newline", () => {
    const log = makeLog();
    log.append("turn/start", { turn: 1 });
    const full = serializeLog(log);
    const torn = full + '{"type":"turn","seq":1,"time":' + T0 + ",'partial";
    expect(deserializeLog(torn).events).toHaveLength(1);
  });

  it("rejects a missing or wrong-version header", () => {
    expect(() => deserializeLog(JSON.stringify({ type: "other" }) + "\n")).toThrow(
      /header/,
    );
    const good = makeLog();
    good.append("turn/start", { turn: 1 });
    const text = serializeLog(good);
    const badVersion = text.replace(`"version":${SESSION_FORMAT_VERSION}`, '"version":99');
    expect(() => deserializeLog(badVersion)).toThrow(/version 99/);
  });

  it("writes and reads a log from disk", () => {
    const dir = mkdtempSync(join(tmpdir(), "deharness-ts-"));
    try {
      const log = makeLog();
      log.append("turn/start", { turn: 1 });
      const path = join(dir, "nested", "sess.jsonl");
      writeLog(path, log);
      expect(readLog(path).events).toHaveLength(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("encodes unsafe path segments injectively", () => {
    expect(encodeSegment("abc-1._zx")).toBe("abc-1._zx");
    expect(encodeSegment("..")).toBe("~002E~002E");
    expect(encodeSegment("a/b")).toBe("a~002Fb");
    expect(encodeSegment("nul\x00byte")).toBe("nul~0000byte");
    expect(() => encodeSegment("")).toThrow(/empty/);
    decodeRoundTrips();
  });

  function decodeRoundTrips(): void {
    // Safety: encoded output only contains the safe alphabet.
    const samples = ["normal", "with space", "dot.dot", "a~b", "ünïcode"];
    for (const s of samples) {
      expect(encodeSegment(s)).toMatch(/^[A-Za-z0-9._-]+$/);
    }
  }
});
