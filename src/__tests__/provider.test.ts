/**
 * Vitest coverage for the **provider-wiring seam** (TICKET-085..089).
 *
 * Deterministic and offline: the real `DeepSeekLlmAdapter` is composed by
 * `selectAdapter`/`main`/`launch`, but its `fetch` is stubbed (via
 * `globalThis.fetch`) so no real network turn ever runs. The no-key path is
 * asserted to keep the deterministic `FakeLlmAdapter` (no fetch call).
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  main,
  launch,
  selectAdapter,
  helpText,
  DeepSeekLlmAdapter,
  FakeLlmAdapter,
  message,
  textBlock,
  readLog,
} from "../index.js";

/** Temp dirs created by the tests, cleaned up in `afterEach`. */
const dirs: string[] = [];

/** Create a fresh temp dir (tracked for cleanup) and a log path inside it. */
function makeLogPath(): string {
  const dir = mkdtempSync(join(tmpdir(), "deharness-provider-"));
  dirs.push(dir);
  return join(dir, "session.jsonl");
}

/** The original `DEEPSEEK_API_KEY`, restored around every test. */
let savedEnvKey: string | undefined;

beforeEach(() => {
  savedEnvKey = process.env.DEEPSEEK_API_KEY;
  delete process.env.DEEPSEEK_API_KEY;
});

afterEach(() => {
  if (savedEnvKey === undefined) delete process.env.DEEPSEEK_API_KEY;
  else process.env.DEEPSEEK_API_KEY = savedEnvKey;
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

/** Build a full SSE body: a sequence of chunk objects + `[DONE]`. */
function sseBody(chunks: unknown[]): string {
  let s = "";
  for (const c of chunks) s += `data: ${JSON.stringify(c)}\n\n`;
  s += "data: [DONE]\n\n";
  return s;
}

/** A single text turn ("ok") as an SSE body. */
const OK_BODY = sseBody([
  { choices: [{ delta: { content: "ok" }, finish_reason: "stop" }] },
]);

/** What a fetch call observed: the URL, the Authorization header, the body. */
interface Seen {
  url?: string;
  auth?: string;
  body?: Record<string, unknown>;
  calls: number;
}

/**
 * A recording `fetch` stub: returns a canned 200 SSE `Response` and records the
 * URL / Authorization / body of each call. No real network.
 */
function makeRecordingFetch(body: string): { seen: Seen; fetch: typeof globalThis.fetch } {
  const seen: Seen = { calls: 0 };
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(enc.encode(body));
      controller.close();
    },
  });
  const fetch = (async (url: string, init?: RequestInit) => {
    seen.calls += 1;
    seen.url = String(url);
    seen.auth = (init?.headers as Record<string, string>)?.["Authorization"];
    seen.body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(stream, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    });
  }) as unknown as typeof globalThis.fetch;
  return { seen, fetch };
}

/** Run `fn` with `globalThis.fetch` swapped for `stub`, restoring afterwards. */
async function withFetch<T>(stub: typeof globalThis.fetch, fn: () => Promise<T>): Promise<T> {
  const orig = globalThis.fetch;
  globalThis.fetch = stub;
  try {
    return await fn();
  } finally {
    globalThis.fetch = orig;
  }
}

describe("selectAdapter (the provider-wiring seam)", () => {
  it("returns the explicit adapter unchanged when one is given", () => {
    const explicit = new FakeLlmAdapter([]);
    // Even with a key present, an explicit adapter wins.
    expect(selectAdapter(explicit, "k", "https://x/v1", "m")).toBe(explicit);
  });

  it("composes a real DeepSeekLlmAdapter when apiKey is a non-empty string", () => {
    const adapter = selectAdapter(undefined, "k", undefined, undefined);
    expect(adapter).toBeInstanceOf(DeepSeekLlmAdapter);
  });

  it("falls back to the deterministic fake when apiKey is an empty string", () => {
    const adapter = selectAdapter(undefined, "", undefined, undefined);
    expect(adapter).not.toBeInstanceOf(DeepSeekLlmAdapter);
    expect(adapter).toBeInstanceOf(FakeLlmAdapter);
  });

  it("falls back to the deterministic fake when apiKey is undefined", () => {
    const adapter = selectAdapter(undefined, undefined, undefined, undefined);
    expect(adapter).not.toBeInstanceOf(DeepSeekLlmAdapter);
    expect(adapter).toBeInstanceOf(FakeLlmAdapter);
  });

  it("threads baseURL and model into the composed DeepSeekLlmAdapter", async () => {
    const { seen, fetch } = makeRecordingFetch(OK_BODY);
    await withFetch(fetch, async () => {
      const adapter = selectAdapter(undefined, "secret", "https://example.test/v1", "m9");
      expect(adapter).toBeInstanceOf(DeepSeekLlmAdapter);
      await adapter.complete([message("user", [textBlock("hi")])]);
    });
    expect(seen.url).toBe("https://example.test/v1/chat/completions");
    expect(seen.auth).toBe("Bearer secret");
    expect(seen.body?.model).toBe("m9");
  });

  it("defaults the model to deepseek-chat when none is given", async () => {
    const { seen, fetch } = makeRecordingFetch(OK_BODY);
    await withFetch(fetch, async () => {
      const adapter = selectAdapter(undefined, "secret", undefined, undefined);
      await adapter.complete([message("user", [textBlock("hi")])]);
    });
    expect(seen.body?.model).toBe("deepseek-chat");
  });
});

describe("main: parseArgv picks up the provider flags", () => {
  it("--api-key / --base-url / --model in argv are consumed (not swallowed as user text) and reach the real adapter", async () => {
    const logPath = makeLogPath();
    const { seen, fetch } = makeRecordingFetch(OK_BODY);
    await withFetch(fetch, async () => {
      const res = await main(
        ["hi", "--api-key", "k1", "--base-url", "https://example.test/v1", "--model", "m9", "--session", logPath],
      );
      expect(res.result.end).toBe("completed");
    });
    // The flags were consumed as value flags: a real adapter was composed and
    // driven (the fake would never call fetch).
    expect(seen.calls).toBe(1);
    expect(seen.url).toBe("https://example.test/v1/chat/completions");
    expect(seen.auth).toBe("Bearer k1");
    expect(seen.body?.model).toBe("m9");
  });
});

describe("main: env fallback DEEPSEEK_API_KEY", () => {
  it("selects the real adapter from DEEPSEEK_API_KEY when no flag is given", async () => {
    const logPath = makeLogPath();
    process.env.DEEPSEEK_API_KEY = "env-key";
    const { seen, fetch } = makeRecordingFetch(OK_BODY);
    await withFetch(fetch, async () => {
      const res = await main(["hi", "--session", logPath]);
      expect(res.result.end).toBe("completed");
    });
    expect(seen.calls).toBe(1);
    expect(seen.auth).toBe("Bearer env-key");
  });

  it("the --api-key flag wins over DEEPSEEK_API_KEY", async () => {
    const logPath = makeLogPath();
    process.env.DEEPSEEK_API_KEY = "env-key";
    const { seen, fetch } = makeRecordingFetch(OK_BODY);
    await withFetch(fetch, async () => {
      await main(["hi", "--api-key", "flag-key", "--session", logPath]);
    });
    expect(seen.auth).toBe("Bearer flag-key");
  });
});

describe("main: no-key regression keeps the deterministic fake", () => {
  it("no key, no injected adapter -> the fake runs (no fetch call), turn completes with the scripted text", async () => {
    const logPath = makeLogPath();
    const { seen, fetch } = makeRecordingFetch(OK_BODY);
    await withFetch(fetch, async () => {
      const res = await main(["hi", "--session", logPath]);
      expect(res.result.end).toBe("completed");
    });
    // The fake was used: fetch was never called.
    expect(seen.calls).toBe(0);
    // The fake's scripted "ok" text is what the turn produced.
    const { events } = readLog(logPath);
    const msg = events.find((e) => e.type === "assistant/message");
    expect(msg?.data.message.content).toBe("ok");
  });
});

describe("launcher: helpText + threading", () => {
  it("helpText documents both provider flags", () => {
    const help = helpText();
    expect(help).toContain("--api-key <key>");
    expect(help).toContain("--base-url <url>");
  });

  it("launch threads apiKey/baseURL into main (real adapter composed, offline)", async () => {
    const logPath = makeLogPath();
    const cap = { out: "", err: "" };
    const stdout = { write: (c: string): boolean => { cap.out += c; return true; } };
    const stderr = { write: (c: string): boolean => { cap.err += c; return true; } };
    const { seen, fetch } = makeRecordingFetch(OK_BODY);
    await withFetch(fetch, async () => {
      const code = await launch({
        argv: ["hi", "--session", logPath],
        apiKey: "k1",
        baseURL: "https://example.test/v1",
        stdout,
        stderr,
      });
      expect(code).toBe(0);
    });
    expect(seen.calls).toBe(1);
    expect(seen.url).toBe("https://example.test/v1/chat/completions");
    expect(seen.auth).toBe("Bearer k1");
  });
});
