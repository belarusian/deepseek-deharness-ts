import { describe, it, expect } from "vitest";
import {
  SessionLog,
  FakeLlmAdapter,
  DeepSeekLlmAdapter,
  withRetry,
  assistantMessage,
  textBlock,
  message,
} from "../index.js";
import type {
  ContentBlock,
  TextBlock,
  LlmAdapter,
  LlmStream,
  StreamChunk,
  StreamEnd,
} from "../index.js";
import type { AssistantMessage as LlmAssistantMessage } from "../llm/index.js";
import type { AssistantMessage as SessionAssistantMessage } from "../session/event.js";

// ── LLM -> session translation (the real composition seam) ─────────────────
// The LLM seam's `AssistantMessage` is `{ role, blocks: ContentBlock[] }`; the
// session's is `{ role, content: string }`. Flatten the text blocks into a
// single `content` string.

function flattenText(blocks: readonly ContentBlock[]): string {
  return blocks
    .filter((b): b is TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

function toSessionAssistant(
  llm: LlmAssistantMessage,
): SessionAssistantMessage {
  return { role: "assistant", content: flattenText(llm.blocks) };
}

// ── offline DeepSeek fetch helpers (no network) ─────────────────────────────

function dataLine(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

function sseBody(chunks: unknown[]): string {
  let s = "";
  for (const c of chunks) s += dataLine(c);
  s += "data: [DONE]\n\n";
  return s;
}

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

/** Collect a stream's values into an array. */
async function collect(stream: LlmStream): Promise<(StreamChunk | StreamEnd)[]> {
  const out: (StreamChunk | StreamEnd)[] = [];
  for await (const v of stream) out.push(v);
  return out;
}

/** Fold a stream's text deltas into a single content string. */
function foldText(values: readonly (StreamChunk | StreamEnd)[]): string {
  return values
    .filter((v): v is StreamChunk => "type" in v && v.type === "text_delta")
    .map((v) => (v as { text: string }).text)
    .join("");
}

// ── the full-seam composition ───────────────────────────────────────────────

describe("integration: SessionLog + LlmAdapter + DeepSeek (offline)", () => {
  it("composes SessionLog + FakeLlmAdapter + DeepSeekLlmAdapter in a single test", async () => {
    const log = new SessionLog("sess-int", { clock: () => 1000 });

    // ── Turn 1: driven by the deterministic FakeLlmAdapter ─────────────────
    const fake = new FakeLlmAdapter([
      { message: assistantMessage([textBlock("Hello from the fake.")], "stop") },
    ]);
    log.append("turn/start", { turn: 1 });
    log.append("user/message", { role: "user", content: "Hi, who are you?" });
    const fakeMsg = await fake.complete([message("user", [textBlock("Hi, who are you?")])]);
    log.append("assistant/message", {
      turn: 1,
      step: 1,
      message: toSessionAssistant(fakeMsg),
    });
    log.append("turn/end", { turn: 1, reason: "stop" });

    // ── Turn 2: driven by the concrete DeepSeekLlmAdapter (offline fetch) ──
    const body = sseBody([
      { choices: [{ delta: { content: "I am " }, finish_reason: null }] },
      { choices: [{ delta: { content: "DeepSeek." }, finish_reason: "stop" }] },
    ]);
    const deepseek = new DeepSeekLlmAdapter({
      apiKey: "test-key",
      model: "deepseek-chat",
      fetch: okSseFetch(body),
    });
    log.append("turn/start", { turn: 2 });
    log.append("user/message", { role: "user", content: "What is your name?" });
    const dsMsg = await deepseek.complete([message("user", [textBlock("What is your name?")])]);
    log.append("assistant/message", {
      turn: 2,
      step: 1,
      message: toSessionAssistant(dsMsg),
    });
    log.append("turn/end", { turn: 2, reason: "stop" });

    // ── Invariants ──────────────────────────────────────────────────────────
    const events = log.readAll();
    expect(events).toHaveLength(8);
    // seq contiguity: seq === index for every event, and log.seq === length.
    for (let i = 0; i < events.length; i++) {
      expect(events[i].seq).toBe(i);
    }
    expect(log.seq).toBe(events.length);

    // readAll() order: the durable facts appear in the exact append order.
    expect(events.map((e) => e.type)).toEqual([
      "turn/start",
      "user/message",
      "assistant/message",
      "turn/end",
      "turn/start",
      "user/message",
      "assistant/message",
      "turn/end",
    ]);

    // The LLM->session translation flattened the text blocks into content.
    const a1 = events[2].data as { message: SessionAssistantMessage };
    expect(a1.message).toEqual({ role: "assistant", content: "Hello from the fake." });
    const a2 = events[6].data as { message: SessionAssistantMessage };
    expect(a2.message).toEqual({ role: "assistant", content: "I am DeepSeek." });
  });

  it("folds a streamed response into a single assistant message in the log", async () => {
    const log = new SessionLog("sess-stream", { clock: () => 2000 });
    const body = sseBody([
      { choices: [{ delta: { content: "Str" }, finish_reason: null }] },
      { choices: [{ delta: { content: "eam" }, finish_reason: null }] },
      { choices: [{ delta: { content: "ed." }, finish_reason: "stop" }] },
    ]);
    const deepseek = new DeepSeekLlmAdapter({
      apiKey: "k",
      model: "deepseek-chat",
      fetch: okSseFetch(body),
    });

    log.append("turn/start", { turn: 1 });
    log.append("user/message", { role: "user", content: "Stream me" });
    const values = await collect(deepseek.stream([message("user", [textBlock("Stream me")])]));
    // The stream ends with a terminal StreamEnd.
    const last = values[values.length - 1];
    expect("finishReason" in last).toBe(true);
    const content = foldText(values);
    log.append("assistant/message", {
      turn: 1,
      step: 1,
      message: { role: "assistant", content },
    });
    log.append("turn/end", { turn: 1, reason: "stop" });

    const events = log.readAll();
    expect(events).toHaveLength(4);
    for (let i = 0; i < events.length; i++) expect(events[i].seq).toBe(i);
    const a = events[2].data as { message: SessionAssistantMessage };
    expect(a.message).toEqual({ role: "assistant", content: "Streamed." });
  });

  it("a retried adapter records exactly one assistant message (no duplication)", async () => {
    const log = new SessionLog("sess-retry", { clock: () => 3000 });
    // The fake succeeds on the first call; wrap it in withRetry to prove the
    // wrapper does not duplicate the assistant message in the log.
    const fake = new FakeLlmAdapter([
      { message: assistantMessage([textBlock("Only once.")], "stop") },
    ]);
    const adapter: LlmAdapter = withRetry(fake, { maxRetries: 3, jitter: false });

    log.append("turn/start", { turn: 1 });
    log.append("user/message", { role: "user", content: "Say it once" });
    const msg = await adapter.complete([message("user", [textBlock("Say it once")])]);
    log.append("assistant/message", {
      turn: 1,
      step: 1,
      message: toSessionAssistant(msg),
    });
    log.append("turn/end", { turn: 1, reason: "stop" });

    const events = log.readAll();
    const assistantEvents = events.filter((e) => e.type === "assistant/message");
    expect(assistantEvents).toHaveLength(1);
    const a = assistantEvents[0].data as { message: SessionAssistantMessage };
    expect(a.message).toEqual({ role: "assistant", content: "Only once." });
    for (let i = 0; i < events.length; i++) expect(events[i].seq).toBe(i);
  });
});
