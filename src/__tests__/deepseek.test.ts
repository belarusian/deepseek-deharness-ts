import { describe, it, expect } from "vitest";
import {
  serializeMessages,
  serializeRequest,
  parseSse,
  translate,
  DeepSeekLlmAdapter,
  DONE,
} from "../index.js";
import { textBlock, toolCallBlock, toolResultBlock, message } from "../index.js";
import type { Message, CallOptions } from "../index.js";
import type { StreamChunk, StreamEnd } from "../index.js";

// ── helpers ─────────────────────────────────────────────────────────────────

/** Wrap a list of strings as an AsyncIterable<Uint8Array> (UTF-8 encoded). */
function bytesFrom(chunks: string[]): AsyncIterable<Uint8Array> {
  const enc = new TextEncoder();
  return {
    [Symbol.asyncIterator]: async function* () {
      for (const c of chunks) yield enc.encode(c);
    },
  };
}

/** Wrap a list of strings as an AsyncIterable<string>. */
function payloadsFrom(payloads: string[]): AsyncIterable<string> {
  return {
    [Symbol.asyncIterator]: async function* () {
      for (const p of payloads) yield p;
    },
  };
}

/** Build a minimal SSE `data:` line for a JSON chunk. */
function dataLine(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

/** Build a full SSE body: a sequence of chunk objects + [DONE]. */
function sseBody(chunks: unknown[]): string {
  let s = "";
  for (const c of chunks) s += dataLine(c);
  s += `data: ${DONE}\n\n`;
  return s;
}

/** A fake fetch returning a 200 SSE response with the given body. */
function okSseFetch(body: string): typeof fetch {
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(enc.encode(body));
      controller.close();
    },
  });
  return (async () =>
    new Response(stream, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    })) as unknown as typeof globalThis.fetch;
}

// ── serializeMessages ───────────────────────────────────────────────────────

describe("serializeMessages", () => {
  it("flattens text blocks into content for system/user", () => {
    const msgs: Message[] = [
      message("system", [textBlock("You are helpful.")]),
      message("user", [textBlock("Hello"), textBlock(" world")]),
    ];
    expect(serializeMessages(msgs)).toEqual([
      { role: "system", content: "You are helpful." },
      { role: "user", content: "Hello world" },
    ]);
  });

  it("assistant tool-call-only turn sends empty-string content + tool_calls", () => {
    const msgs: Message[] = [
      message("assistant", [
        toolCallBlock("call_1", "get_weather", '{"city":"Paris"}'),
      ]),
    ];
    expect(serializeMessages(msgs)).toEqual([
      {
        role: "assistant",
        content: "",
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: { name: "get_weather", arguments: '{"city":"Paris"}' },
          },
        ],
      },
    ]);
  });

  it("assistant with both text and tool_calls keeps both", () => {
    const msgs: Message[] = [
      message("assistant", [
        textBlock("Let me check."),
        toolCallBlock("call_2", "search", '{"q":"ts"}'),
      ]),
    ];
    const [w] = serializeMessages(msgs);
    expect(w.content).toBe("Let me check.");
    expect(w.tool_calls).toHaveLength(1);
    expect(w.tool_calls?.[0].function.name).toBe("search");
  });

  it("tool_result blocks become standalone role:tool messages", () => {
    const msgs: Message[] = [
      message("user", [toolResultBlock("call_1", "Sunny, 22C")]),
    ];
    expect(serializeMessages(msgs)).toEqual([
      { role: "tool", tool_call_id: "call_1", content: "Sunny, 22C" },
    ]);
  });

  it("empty tool output renders as (no output)", () => {
    const msgs: Message[] = [
      message("user", [toolResultBlock("call_9", "")]),
    ];
    expect(serializeMessages(msgs)).toEqual([
      { role: "tool", tool_call_id: "call_9", content: "(no output)" },
    ]);
  });

  it("user message with text + tool result emits text then tool message", () => {
    const msgs: Message[] = [
      message("user", [textBlock("Here you go"), toolResultBlock("c1", "ok")]),
    ];
    expect(serializeMessages(msgs)).toEqual([
      { role: "user", content: "Here you go" },
      { role: "tool", tool_call_id: "c1", content: "ok" },
    ]);
  });
});

// ── serializeRequest ────────────────────────────────────────────────────────

describe("serializeRequest", () => {
  it("always sets stream:true and stream_options.include_usage", () => {
    const req = serializeRequest([message("user", [textBlock("hi")])]);
    expect(req.stream).toBe(true);
    expect(req.stream_options).toEqual({ include_usage: true });
  });

  it("defaults model to deepseek-chat and omits undefined opts", () => {
    const req = serializeRequest([message("user", [textBlock("hi")])]);
    expect(req.model).toBe("deepseek-chat");
    expect(req.max_tokens).toBeUndefined();
    expect(req.temperature).toBeUndefined();
    expect(req.tools).toBeUndefined();
  });

  it("maps model/maxTokens/temperature/tools when provided", () => {
    const opts: CallOptions = {
      model: "deepseek-chat",
      maxTokens: 4096,
      temperature: 0.7,
      tools: [
        {
          name: "get_weather",
          description: "Get weather",
          parameters: { type: "object" },
        },
      ],
    };
    const req = serializeRequest([message("user", [textBlock("hi")])], opts);
    expect(req.model).toBe("deepseek-chat");
    expect(req.max_tokens).toBe(4096);
    expect(req.temperature).toBe(0.7);
    expect(req.tools).toHaveLength(1);
    expect(req.tools?.[0].function.name).toBe("get_weather");
  });
});

// ── parseSse ────────────────────────────────────────────────────────────────

describe("parseSse", () => {
  it("parses simple data events and stops at [DONE]", async () => {
    const input = bytesFrom([
      'data: {"id":"1"}\n\n',
      'data: {"id":"2"}\n\n',
      `data: ${DONE}\n\n`,
    ]);
    const out: string[] = [];
    for await (const p of parseSse(input)) out.push(p);
    expect(out).toEqual(['{"id":"1"}', '{"id":"2"}', DONE]);
  });

  it("reassembles UTF-8 split across chunk boundaries", async () => {
    // "héllo" — split in the middle of the é (0xC3 0xA9)
    const full = `data: héllo\n\ndata: ${DONE}\n\n`;
    const enc = new TextEncoder();
    const bytes = enc.encode(full);
    // find the byte index of the é and split mid-sequence
    const idx = full.indexOf("é");
    const splitAt = enc.encode(full.slice(0, idx)).length + 1; // after first byte of é
    const c1 = bytes.slice(0, splitAt);
    const c2 = bytes.slice(splitAt);
    const input: AsyncIterable<Uint8Array> = {
      [Symbol.asyncIterator]: async function* () {
        yield c1;
        yield c2;
      },
    };
    const out: string[] = [];
    for await (const p of parseSse(input)) out.push(p);
    expect(out[0]).toBe("héllo");
    expect(out[1]).toBe(DONE);
  });

  it("joins multi-data fields with newline", async () => {
    const input = bytesFrom([
      "data: line1\n",
      "data: line2\n",
      "\n",
      `data: ${DONE}\n\n`,
    ]);
    const out: string[] = [];
    for await (const p of parseSse(input)) out.push(p);
    expect(out[0]).toBe("line1\nline2");
    expect(out[1]).toBe(DONE);
  });

  it("skips comments and non-data fields", async () => {
    const input = bytesFrom([
      ": this is a comment\n",
      "event: message\n",
      "id: 42\n",
      "data: hello\n",
      "\n",
      `data: ${DONE}\n\n`,
    ]);
    const out: string[] = [];
    for await (const p of parseSse(input)) out.push(p);
    expect(out).toEqual(["hello", DONE]);
  });

  it("throws LlmFailure stream_closed when [DONE] is missing", async () => {
    const input = bytesFrom(['data: {"id":"1"}\n\n']);
    await expect(
      (async () => {
        const out: string[] = [];
        for await (const p of parseSse(input)) out.push(p);
        return out;
      })(),
    ).rejects.toMatchObject({ code: "stream_closed" });
  });
});

// ── translate ───────────────────────────────────────────────────────────────

describe("translate", () => {
  it("yields text deltas, defers usage+finish to [DONE], ends with StreamEnd", async () => {
    const payloads = payloadsFrom([
      JSON.stringify({
        choices: [{ delta: { content: "Hello" }, finish_reason: null }],
      }),
      JSON.stringify({
        choices: [{ delta: { content: " world" }, finish_reason: null }],
      }),
      JSON.stringify({
        choices: [{ delta: {}, finish_reason: "stop" }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      }),
      DONE,
    ]);
    const out: (StreamChunk | StreamEnd)[] = [];
    for await (const c of translate(payloads)) out.push(c);
    expect(out).toEqual([
      { type: "text_delta", text: "Hello" },
      { type: "text_delta", text: " world" },
      { type: "usage", promptTokens: 10, completionTokens: 5 },
      { type: "finish", reason: "stop" },
      { finishReason: "stop", usage: { promptTokens: 10, completionTokens: 5 } },
    ]);
  });

  it("yields tool-call deltas grouped by index", async () => {
    const payloads = payloadsFrom([
      JSON.stringify({
        choices: [
          {
            delta: {
              tool_calls: [
                { index: 0, id: "call_1", type: "function", function: { name: "get_" } },
              ],
            },
            finish_reason: null,
          },
        ],
      }),
      JSON.stringify({
        choices: [
          {
            delta: { tool_calls: [{ index: 0, function: { arguments: '{"ci' } }] },
            finish_reason: null,
          },
        ],
      }),
      JSON.stringify({
        choices: [
          {
            delta: { tool_calls: [{ index: 0, function: { arguments: 'ty":"Paris"}' } }] },
            finish_reason: "tool_calls",
          },
        ],
      }),
      DONE,
    ]);
    const out: (StreamChunk | StreamEnd)[] = [];
    for await (const c of translate(payloads)) out.push(c);
    // three tool_call_delta chunks
    const tcds = out.filter((c): c is StreamChunk => "type" in c && c.type === "tool_call_delta");
    expect(tcds).toHaveLength(3);
    expect(tcds[0]).toEqual({ type: "tool_call_delta", id: "call_1", name: "get_", arguments: "" });
    expect(tcds[1]).toEqual({ type: "tool_call_delta", id: "", name: "", arguments: '{"ci' });
    expect(tcds[2]).toEqual({ type: "tool_call_delta", id: "", name: "", arguments: 'ty":"Paris"}' });
    // finish + end
    expect(out[out.length - 2]).toEqual({ type: "finish", reason: "tool_calls" });
    expect(out[out.length - 1]).toEqual({ finishReason: "tool_calls" });
  });

  it("throws LlmFailure malformed_response on bad JSON", async () => {
    const payloads = payloadsFrom(["not valid json {{{", DONE]);
    await expect(
      (async () => {
        for await (const _ of translate(payloads)) {
          /* consume */
        }
      })(),
    ).rejects.toMatchObject({ code: "malformed_response" });
  });
});

// ── DeepSeekLlmAdapter ──────────────────────────────────────────────────────

describe("DeepSeekLlmAdapter", () => {
  it("complete() assembles an AssistantMessage from an SSE stream", async () => {
    const body = sseBody([
      { choices: [{ delta: { content: "Hi" }, finish_reason: null }] },
      { choices: [{ delta: { content: "!" }, finish_reason: null }] },
      {
        choices: [{ delta: {}, finish_reason: "stop" }],
        usage: { prompt_tokens: 5, completion_tokens: 3 },
      },
    ]);
    const fetch = okSseFetch(body);
    const adapter = new DeepSeekLlmAdapter({
      apiKey: "test-key",
      model: "deepseek-chat",
      fetch,
    });
    const result = await adapter.complete([message("user", [textBlock("Hello")])]);
    expect(result.role).toBe("assistant");
    expect(result.finishReason).toBe("stop");
    const text = result.blocks.find((b) => b.type === "text");
    expect(text).toBeDefined();
    expect((text as { text: string }).text).toBe("Hi!");
  });

  it("complete() assembles tool_call blocks from streamed fragments", async () => {
    const body = sseBody([
      {
        choices: [
          {
            delta: {
              tool_calls: [
                { index: 0, id: "call_1", type: "function", function: { name: "get_weather" } },
              ],
            },
            finish_reason: null,
          },
        ],
      },
      {
        choices: [
          {
            delta: { tool_calls: [{ index: 0, function: { arguments: '{"city":"Paris"}' } }] },
            finish_reason: null,
          },
        ],
      },
      { choices: [{ delta: {}, finish_reason: "tool_calls" }] },
    ]);
    const adapter = new DeepSeekLlmAdapter({
      apiKey: "k",
      model: "deepseek-chat",
      fetch: okSseFetch(body),
    });
    const result = await adapter.complete([message("user", [textBlock("weather in Paris?")])]);
    expect(result.finishReason).toBe("tool_calls");
    const tc = result.blocks.find((b) => b.type === "tool_call");
    expect(tc).toBeDefined();
    expect(tc).toEqual({
      type: "tool_call",
      id: "call_1",
      name: "get_weather",
      arguments: '{"city":"Paris"}',
    });
  });

  it("stream() yields chunks then a terminal StreamEnd", async () => {
    const body = sseBody([
      { choices: [{ delta: { content: "Y" }, finish_reason: null }] },
      { choices: [{ delta: { content: "o" }, finish_reason: null }] },
      {
        choices: [{ delta: {}, finish_reason: "stop" }],
        usage: { prompt_tokens: 2, completion_tokens: 1 },
      },
    ]);
    const adapter = new DeepSeekLlmAdapter({
      apiKey: "k",
      model: "deepseek-chat",
      fetch: okSseFetch(body),
    });
    const out: (StreamChunk | StreamEnd)[] = [];
    for await (const c of adapter.stream([message("user", [textBlock("Hi")])])) {
      out.push(c);
    }
    const textDeltas = out.filter((c): c is StreamChunk => "type" in c && c.type === "text_delta");
    expect(textDeltas.map((c) => (c as { text: string }).text)).toEqual(["Y", "o"]);
    const end = out[out.length - 1];
    expect("finishReason" in end).toBe(true);
    expect((end as StreamEnd).finishReason).toBe("stop");
  });

  it("401 → LlmFailure auth with status", async () => {
    const fetch = (async () =>
      new Response(JSON.stringify({ error: { message: "Invalid API key" } }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      })) as unknown as typeof globalThis.fetch;
    const adapter = new DeepSeekLlmAdapter({ apiKey: "bad", model: "m", fetch });
    await expect(
      adapter.complete([message("user", [textBlock("Hi")])]),
    ).rejects.toMatchObject({ code: "auth", status: 401 });
  });

  it("429 → rate_limited with retryAfterMs from retry-after header", async () => {
    const fetch = (async () =>
      new Response(JSON.stringify({ error: { message: "Rate limited" } }), {
        status: 429,
        headers: { "Content-Type": "application/json", "retry-after": "5" },
      })) as unknown as typeof globalThis.fetch;
    const adapter = new DeepSeekLlmAdapter({ apiKey: "k", model: "m", fetch });
    await expect(
      adapter.complete([message("user", [textBlock("Hi")])]),
    ).rejects.toMatchObject({ code: "rate_limited", status: 429, retryAfterMs: 5000 });
  });

  it("503 → overloaded", async () => {
    const fetch = (async () =>
      new Response("Service Unavailable", { status: 503 })) as unknown as typeof globalThis.fetch;
    const adapter = new DeepSeekLlmAdapter({ apiKey: "k", model: "m", fetch });
    await expect(
      adapter.complete([message("user", [textBlock("Hi")])]),
    ).rejects.toMatchObject({ code: "overloaded", status: 503 });
  });

  it("500 → http_500", async () => {
    const fetch = (async () =>
      new Response("Internal Server Error", { status: 500 })) as unknown as typeof globalThis.fetch;
    const adapter = new DeepSeekLlmAdapter({ apiKey: "k", model: "m", fetch });
    await expect(
      adapter.complete([message("user", [textBlock("Hi")])]),
    ).rejects.toMatchObject({ code: "http_500", status: 500 });
  });

  it("sends the bearer key and posts to /chat/completions", async () => {
    const seen: { url?: string; auth?: string } = {};
    const body = sseBody([{ choices: [{ delta: { content: "ok" }, finish_reason: "stop" }] }]);
    const enc = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(enc.encode(body));
        c.close();
      },
    });
    const fetch = (async (url: string, init?: RequestInit) => {
      seen.url = String(url);
      seen.auth = (init?.headers as Record<string, string>)?.["Authorization"];
      return new Response(stream, { status: 200 });
    }) as unknown as typeof globalThis.fetch;
    const adapter = new DeepSeekLlmAdapter({
      apiKey: "secret",
      model: "deepseek-chat",
      baseURL: "https://api.deepseek.com/v1",
      fetch,
    });
    await adapter.complete([message("user", [textBlock("Hi")])]);
    expect(seen.url).toBe("https://api.deepseek.com/v1/chat/completions");
    expect(seen.auth).toBe("Bearer secret");
  });
});
