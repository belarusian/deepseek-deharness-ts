# TICKET-011: Implement the retry/resilience wrapper `src/llm/retry.ts`

**Cycle:** 6 (synthesis)
**Priority:** P0
**Status:** open
**Target file:** `src/llm/retry.ts` (new)

## Title
Add a thin, provider-neutral retry wrapper: `withRetry(adapter, opts?)` returns
a **new** `LlmAdapter` that retries transient failures with exponential backoff
and passes non-retryable failures straight through.

## Evidence
The target module does not exist. `ls src/llm/retry.ts` -> "No such file or
directory", and `grep -rn "withRetry\|RetryOptions\|backoff\|jitter" src/`
returns nothing. The seam it must wrap is fully in place:

- `src/llm/adapter.ts:60-66` - `LlmAdapter` is a plain interface with
  `complete(messages, opts?): Promise<AssistantMessage>` and
  `stream(messages, opts?): LlmStream`. A wrapper can implement this interface
  by delegating to an inner adapter.
- `src/llm/adapter.ts:34-50` - `LlmFailure extends Error` carries a stable
  `code: string` plus optional `status?: number` and `retryAfterMs?: number`.
  The wrapper branches on `code` (and may consult `retryAfterMs`).
- `src/llm/deepseek/adapter.ts:150-162` - `mapStatusCode` produces exactly the
  codes the spec names: `401 -> "auth"`, `429 -> "rate_limited"`,
  `503 -> "overloaded"`, and `default -> "http_${status}"` (so `http_5xx` is
  the family `http_500`/`http_502`/`http_503`/`http_504`/`http_599`).
- `src/llm/deepseek/sse.ts:78` and `src/llm/deepseek/adapter.ts:76,118` throw
  `code: "stream_closed"`; `src/llm/deepseek/translate.ts` throws
  `code: "malformed_response"`. These are the non-retryable codes the spec
  lists.
- `src/llm/fake.ts:45` throws `code: "exhausted"` - a non-retryable code the
  wrapper must also pass through (it is not in the transient set).

## Spec to implement
`withRetry(adapter: LlmAdapter, opts?: RetryOptions): LlmAdapter` where
`RetryOptions` is:

    interface RetryOptions {
      readonly maxRetries?: number;   // default 3
      readonly baseDelayMs?: number;  // default 500
      readonly maxDelayMs?: number;   // default 30000
      readonly jitter?: boolean;      // default true
    }

- **Transient (retry):** `rate_limited`, `overloaded`, and any `http_5xx`
  (code matches `/^http_5\d\d$/`).
- **Non-retryable (pass through immediately):** `auth`, `malformed_response`,
  `stream_closed`, and any other code not in the transient set (e.g.
  `exhausted`, `http_4xx`).
- **Backoff:** exponential - delay for retry attempt `n` (0-indexed) is
  `min(baseDelayMs * 2**n, maxDelayMs)`; when `jitter` is true, apply full
  jitter so the value lands in `[0, delay]`.
- **Exhaustion:** after `maxRetries` retries the last `LlmFailure` is rethrown.
- The wrapper must be **pure composition**: it does not mutate the inner
  adapter and returns a fresh `LlmAdapter` object.

## Impact
Without this, every transient provider failure (rate limit, overload, 5xx)
propagates to the agent loop as a hard failure. The spec's resilience contract
is unimplemented; the seam has no retry behavior at all.

## Suggestion
Create `src/llm/retry.ts` exporting `withRetry` and the `RetryOptions` type.
Implement a private `isTransient(code: string)` predicate and a `sleep(ms)`
helper. For `complete`, wrap the inner call in a retry loop that catches
`LlmFailure` and retries only when `isTransient(f.code)`. For `stream`, see
TICKET-012. Make the clock and RNG injectable (see TICKET-015) so tests are
deterministic.

## Acceptance Criteria
- [ ] `withRetry` returns a new `LlmAdapter` (not the same reference)
- [ ] `complete` retries `rate_limited`/`overloaded`/`http_5xx` up to `maxRetries`
- [ ] `complete` passes `auth`/`malformed_response`/`stream_closed`/`exhausted` through on first throw
- [ ] Backoff is exponential and capped at `maxDelayMs`
- [ ] `jitter: false` yields deterministic delays; `jitter: true` stays within `[0, cap]`
- [ ] After exhaustion the final `LlmFailure` is rethrown
