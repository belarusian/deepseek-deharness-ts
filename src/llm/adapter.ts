/**
 * The **adapter interface** of the LLM seam.
 *
 * `LlmAdapter` is the plain interface the agent loop (cycles 10-13) calls
 * directly: `complete` for a single assembled assistant message, `stream` for
 * an incremental {@link LlmStream}. No DI, no registration, no Cordis event
 * seams — just a clean API.
 */

import type { AssistantMessage, Message } from "./message.js";
import type { LlmStream } from "./stream.js";

/** A tool the model may invoke, described for the provider. */
export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  /** JSON-Schema-shaped parameter description. */
  readonly parameters: Record<string, unknown>;
}

/** Per-call options. All fields optional; absent means provider default. */
export interface CallOptions {
  readonly model?: string;
  readonly maxTokens?: number;
  readonly temperature?: number;
  readonly tools?: readonly ToolDefinition[];
}

/**
 * A stable, structured failure from the seam. `code` is a stable string the
 * caller can branch on (e.g. `"rate_limited"`, `"overloaded"`, `"auth"`);
 * `status` and `retryAfterMs` are present when the provider reports them.
 */
export class LlmFailure extends Error {
  readonly code: string;
  readonly status?: number;
  readonly retryAfterMs?: number;

  constructor(
    message: string,
    code: string,
    status?: number,
    retryAfterMs?: number,
  ) {
    super(message);
    this.name = "LlmFailure";
    this.code = code;
    if (status !== undefined) this.status = status;
    if (retryAfterMs !== undefined) this.retryAfterMs = retryAfterMs;
  }
}

/** The LLM seam the agent loop composes by direct import. */
export interface LlmAdapter {
  /** One model call, returning the assembled assistant message. */
  complete(
    messages: readonly Message[],
    opts?: CallOptions,
  ): Promise<AssistantMessage>;
  /** One model call, streamed as an async iterable ending in `StreamEnd`. */
  stream(messages: readonly Message[], opts?: CallOptions): LlmStream;
}
