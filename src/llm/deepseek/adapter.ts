/**
 * The concrete DeepSeek HTTP adapter: `fetch` + SSE against the OpenAI-compatible
 * chat-completions endpoint, emitting the provider-neutral stream vocabulary.
 *
 * The adapter is transport-only. `fetch` is injectable so tests run offline;
 * it defaults to the global `fetch` (Node 18+). No DI, no registration — the
 * agent loop composes this by direct import.
 *
 * @module llm/deepseek/adapter
 */

import type { AssistantMessage, ContentBlock, Message } from "../message.js";
import { assistantMessage, textBlock, toolCallBlock } from "../message.js";
import type { LlmAdapter } from "../adapter.js";
import type { LlmStream } from "../stream.js";
import { LlmFailure } from "../adapter.js";
import type { CallOptions } from "../adapter.js";
import type { StreamChunk, StreamEnd } from "../stream.js";
import { serializeRequest } from "./serialize.js";
import { parseSse } from "./sse.js";
import { translate } from "./translate.js";
import type { WireError, WireRequest } from "./types.js";

/** Default DeepSeek API base URL. */
const DEFAULT_BASE_URL = "https://api.deepseek.com/v1";

/** Configuration for {@link DeepSeekLlmAdapter}. */
export interface DeepSeekAdapterConfig {
  /** Bearer token sent on every request. */
  apiKey: string;
  /** Default wire model id; per-call `opts.model` overrides it. */
  model: string;
  /** Endpoint base; `/chat/completions` is appended. Defaults to the public API. */
  baseURL?: string;
  /** Injectable fetch (defaults to global `fetch`) for offline tests. */
  fetch?: typeof globalThis.fetch;
}

/**
 * A concrete {@link LlmAdapter} that talks to the DeepSeek OpenAI-compatible
 * chat-completions endpoint over HTTP.
 */
export class DeepSeekLlmAdapter implements LlmAdapter {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseURL: string;
  private readonly fetchFn: typeof globalThis.fetch;

  constructor(config: DeepSeekAdapterConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.baseURL = (config.baseURL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.fetchFn = config.fetch ?? globalThis.fetch;
  }

  /** One model call, returning the assembled assistant message. */
  async complete(
    messages: readonly Message[],
    opts?: CallOptions,
  ): Promise<AssistantMessage> {
    const body = serializeRequest(messages, { ...opts, model: opts?.model ?? this.model });
    const response = await this.doFetch(body);
    if (!response.body) {
      throw new LlmFailure("DeepSeek API returned no response body", "stream_closed");
    }

    const blocks: ContentBlock[] = [];
    let text = "";
    const calls: { id: string; name: string; arguments: string }[] = [];
    let current: { id: string; name: string; arguments: string } | null = null;
    let finishReason = "stop";

    for await (const chunk of translate(parseSse(response.body))) {
      if ("finishReason" in chunk) {
        // StreamEnd (terminal)
        finishReason = chunk.finishReason;
        continue;
      }
      if (chunk.type === "text_delta") {
        text += chunk.text;
      } else if (chunk.type === "tool_call_delta") {
        if (chunk.id.length > 0) {
          current = { id: chunk.id, name: "", arguments: "" };
          calls.push(current);
        }
        if (current === null) {
          current = { id: "", name: "", arguments: "" };
          calls.push(current);
        }
        if (chunk.name.length > 0) current.name += chunk.name;
        if (chunk.arguments.length > 0) current.arguments += chunk.arguments;
      } else if (chunk.type === "finish") {
        finishReason = chunk.reason;
      }
    }

    if (text.length > 0) blocks.push(textBlock(text));
    for (const c of calls) blocks.push(toolCallBlock(c.id, c.name, c.arguments));

    return assistantMessage(blocks, finishReason);
  }

  /** One model call, streamed as an async iterable ending in `StreamEnd`. */
  stream(messages: readonly Message[], opts?: CallOptions): LlmStream {
    const body = serializeRequest(messages, { ...opts, model: opts?.model ?? this.model });
    return this.runStream(body);
  }

  /** The stream body: fetch, then translate the SSE stream. */
  private async *runStream(body: WireRequest): AsyncGenerator<StreamChunk | StreamEnd> {
    const response = await this.doFetch(body);
    if (!response.body) {
      throw new LlmFailure("DeepSeek API returned no response body", "stream_closed");
    }
    yield* translate(parseSse(response.body));
  }

  /** POST the request; map non-2xx responses to a structured {@link LlmFailure}. */
  private async doFetch(body: WireRequest): Promise<Response> {
    const url = `${this.baseURL}/chat/completions`;
    const response = await this.fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const code = mapStatusCode(response.status);
      const retryAfter = response.headers.get("retry-after");
      const retryAfterMs = retryAfter !== null ? parseRetryAfter(retryAfter) : undefined;

      let message = `DeepSeek API error (HTTP ${response.status})`;
      try {
        const parsed = (await response.json()) as WireError;
        if (parsed.error?.message) message = parsed.error.message;
      } catch {
        // Malformed error body: the HTTP status still identifies the failure.
      }

      throw new LlmFailure(message, code, response.status, retryAfterMs);
    }

    return response;
  }
}

/** Map an HTTP status to a stable failure code. */
function mapStatusCode(status: number): string {
  switch (status) {
    case 401:
      return "auth";
    case 429:
      return "rate_limited";
    case 503:
      return "overloaded";
    default:
      return `http_${status}`;
  }
}

/** Parse a `retry-after` header (seconds or HTTP-date) into milliseconds. */
function parseRetryAfter(value: string): number {
  const seconds = Number(value);
  if (!Number.isNaN(seconds)) return Math.round(seconds * 1000);
  const date = Date.parse(value);
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  return 0;
}
