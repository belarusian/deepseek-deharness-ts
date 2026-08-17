/**
 * A thin, provider-neutral **retry/resilience wrapper** for the LLM seam.
 *
 * `withRetry(adapter, opts?)` returns a *fresh* {@link LlmAdapter} that
 * transparently retries **transient** failures with exponential backoff (plus
 * optional full jitter) and passes **non-retryable** failures straight through.
 * It is pure composition: the inner adapter is never mutated, and no DI,
 * registration, or global state is required to use it.
 *
 * Transient (retried): `rate_limited`, `overloaded`, and any `http_5xx` code
 * (matching `/^http_5\d\d$/`). Non-retryable (passed through immediately):
 * `auth`, `malformed_response`, `stream_closed`, and every other code (e.g.
 * `exhausted`, `http_4xx`).
 *
 * `complete()` retries the whole call. `stream()` retries **only** the initial
 * connection, and only while the failure occurs *before the first chunk is
 * yielded*; once the first value has been delivered, every subsequent value is
 * forwarded verbatim from that same inner stream and any later error
 * propagates immediately (no retry), so a consumer never sees duplicated
 * output.
 *
 * The sleep and RNG are injectable via a module-level hook
 * ({@link __setRetryInternals}) so tests are deterministic and fast.
 *
 * @module llm/retry
 */

import type { AssistantMessage, Message } from "./message.js";
import { LlmFailure } from "./adapter.js";
import type { CallOptions, LlmAdapter } from "./adapter.js";
import type { LlmStream, StreamChunk, StreamEnd } from "./stream.js";

/** Default number of retries after the initial attempt. */
const DEFAULT_MAX_RETRIES = 3;
/** Default base backoff delay in milliseconds. */
const DEFAULT_BASE_DELAY_MS = 500;
/** Default cap on a single backoff delay in milliseconds. */
const DEFAULT_MAX_DELAY_MS = 30000;
/** Default: apply full jitter. */
const DEFAULT_JITTER = true;

/** Per-call retry configuration. All fields optional; absent means default. */
export interface RetryOptions {
  /** Max retries after the initial attempt. Default `3`. */
  readonly maxRetries?: number;
  /** Base backoff delay (ms) for retry attempt 0. Default `500`. */
  readonly baseDelayMs?: number;
  /** Cap on a single backoff delay (ms). Default `30000`. */
  readonly maxDelayMs?: number;
  /** Apply full jitter so the delay lands in `[0, cap]`. Default `true`. */
  readonly jitter?: boolean;
}

/** A transient failure code: safe to retry. */
function isTransient(code: string): boolean {
  if (code === "rate_limited" || code === "overloaded") return true;
  return /^http_5\d\d$/.test(code);
}

/**
 * Compute the backoff delay for retry attempt `n` (0-indexed):
 * `min(baseDelayMs * 2**n, maxDelayMs)`, then full jitter (scale by a uniform
 * random in `[0, 1]`) when `jitter` is enabled.
 */
function computeDelay(
  n: number,
  baseDelayMs: number,
  maxDelayMs: number,
  jitter: boolean,
  random: () => number,
): number {
  const cap = Math.min(baseDelayMs * 2 ** n, maxDelayMs);
  return jitter ? random() * cap : cap;
}

// ── Injectable internals (deterministic tests) ──────────────────────────────
// Production defaults: a real timer and the platform RNG. Tests override these
// via {@link __setRetryInternals} to capture delays and pin the jitter.

interface RetryInternals {
  readonly sleep: (ms: number) => Promise<void>;
  readonly random: () => number;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const DEFAULT_INTERNALS: RetryInternals = {
  sleep: defaultSleep,
  random: Math.random,
};

let internals: RetryInternals = DEFAULT_INTERNALS;

/**
 * Override the sleep and/or RNG used by the retry wrapper. Test-only: pass a
 * `sleep` that records delays (and returns immediately) and/or a `random` that
 * pins the jitter. Pass nothing to restore the production defaults.
 */
export function __setRetryInternals(next: Partial<RetryInternals> = {}): void {
  internals = {
    sleep: next.sleep ?? DEFAULT_INTERNALS.sleep,
    random: next.random ?? DEFAULT_INTERNALS.random,
  };
}

/** Restore the production sleep/RNG defaults (test-only). */
export function __resetRetryInternals(): void {
  internals = DEFAULT_INTERNALS;
}

/**
 * A plain decorator {@link LlmAdapter} that retries transient failures with
 * exponential backoff. Constructed by {@link withRetry}; not intended to be
 * instantiated directly, but exposed for composition clarity.
 */
export class RetryAdapter implements LlmAdapter {
  private readonly inner: LlmAdapter;
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly jitter: boolean;

  constructor(inner: LlmAdapter, opts?: RetryOptions) {
    this.inner = inner;
    this.maxRetries = opts?.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.baseDelayMs = opts?.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
    this.maxDelayMs = opts?.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
    this.jitter = opts?.jitter ?? DEFAULT_JITTER;
  }

  /** One model call, retrying transient {@link LlmFailure}s up to `maxRetries`. */
  async complete(
    messages: readonly Message[],
    opts?: CallOptions,
  ): Promise<AssistantMessage> {
    let attempt = 0;
    for (;;) {
      try {
        return await this.inner.complete(messages, opts);
      } catch (err) {
        if (
          err instanceof LlmFailure &&
          isTransient(err.code) &&
          attempt < this.maxRetries
        ) {
          const delay = computeDelay(
            attempt,
            this.baseDelayMs,
            this.maxDelayMs,
            this.jitter,
            internals.random,
          );
          await internals.sleep(delay);
          attempt += 1;
          continue;
        }
        throw err;
      }
    }
  }

  /**
   * One model call, streamed. Retries only the initial connection, and only
   * while the failure occurs before the first chunk is yielded; after the
   * first value is delivered, all values are forwarded verbatim with no retry.
   */
  stream(messages: readonly Message[], opts?: CallOptions): LlmStream {
    const inner = this.inner;
    const maxRetries = this.maxRetries;
    const baseDelayMs = this.baseDelayMs;
    const maxDelayMs = this.maxDelayMs;
    const jitter = this.jitter;

    return {
      [Symbol.asyncIterator]() {
        let it: AsyncIterator<StreamChunk | StreamEnd> | null = null;
        let started = false;
        let attempt = 0;

        return {
          async next(): Promise<IteratorResult<StreamChunk | StreamEnd>> {
            // Once the first value has been delivered, forward verbatim.
            if (started) {
              return (it as AsyncIterator<StreamChunk | StreamEnd>).next();
            }

            // Initial-connection phase: retry transient failures only.
            for (;;) {
              if (it === null) {
                it = inner.stream(messages, opts)[Symbol.asyncIterator]();
              }
              try {
                const result = await it.next();
                // The connection succeeded (first value, or an empty stream).
                started = true;
                return result;
              } catch (err) {
                if (
                  err instanceof LlmFailure &&
                  isTransient(err.code) &&
                  attempt < maxRetries
                ) {
                  const delay = computeDelay(
                    attempt,
                    baseDelayMs,
                    maxDelayMs,
                    jitter,
                    internals.random,
                  );
                  await internals.sleep(delay);
                  attempt += 1;
                  // Force a fresh inner stream on the next attempt.
                  it = null;
                  continue;
                }
                throw err;
              }
            }
          },
          async return(value?: unknown) {
            if (it !== null && it.return !== undefined) return it.return(value);
            return { value, done: true };
          },
          async throw(error?: unknown) {
            if (it !== null && it.throw !== undefined) return it.throw(error);
            throw error;
          },
        };
      },
    };
  }
}

/**
 * Wrap an {@link LlmAdapter} with transient-failure retry. Returns a **new**
 * adapter (the input is not mutated) that retries `rate_limited` /
 * `overloaded` / `http_5xx` with exponential backoff and passes every other
 * failure through immediately.
 */
export function withRetry(adapter: LlmAdapter, opts?: RetryOptions): LlmAdapter {
  return new RetryAdapter(adapter, opts);
}
