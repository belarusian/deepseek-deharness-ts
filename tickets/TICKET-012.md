# TICKET-012: `stream()` retries only the initial connection before the first chunk

**Cycle:** 6 (synthesis)
**Priority:** P0
**Status:** open
**Target file:** `src/llm/retry.ts` (new, `stream` path)

## Title
The retry wrapper's `stream()` must retry **only** the initial connection
attempt, and only if the failure occurs **before the first chunk is yielded**.
Once any chunk has been delivered to the consumer, a failure must propagate
immediately (no retry), because the consumer has already observed partial
output and a re-run would duplicate it.

## Evidence
- `src/llm/adapter.ts:64-66` - `stream(messages, opts?): LlmStream` returns a
  lazy async iterable; the underlying work (the HTTP fetch) does not start
  until the first `next()` is called.
- `src/llm/deepseek/adapter.ts:110-121` - `runStream` is an async generator:
  `const response = await this.doFetch(body)` runs on the **first** `next()`,
  then `yield* translate(parseSse(response.body))`. So a connection failure
  (e.g. 429/503 from `doFetch`) surfaces on the first `next()`, while a
  mid-stream failure (`stream_closed` from `sse.ts:78`, `malformed_response`
  from `translate.ts`) surfaces on a later `next()`.
- `src/llm/stream.ts:110-135` - `makeLlmStream` shows the canonical shape: an
  object whose `[Symbol.asyncIterator]()` returns an `AsyncIterator`. The
  wrapper can return such an object and control when the inner stream is
  created.

## Spec to implement
`withRetry(...).stream(messages, opts?)` returns an `LlmStream` such that:

1. On the first `next()`, attempt the inner `adapter.stream(...)` and pull its
   first value.
2. If that first pull rejects with a **transient** `LlmFailure`
   (`rate_limited`/`overloaded`/`http_5xx`) and retries remain, back off and
   start a **fresh** inner stream, then pull its first value. Repeat up to
   `maxRetries`.
3. If the first pull rejects with a **non-retryable** code, propagate it
   immediately.
4. Once the first value has been successfully yielded to the consumer, **all
   subsequent values are forwarded verbatim** from that same inner stream; any
   later error (including a transient one) propagates immediately with **no
   retry**.
5. On exhaustion, the last transient `LlmFailure` is rethrown.

## Impact
If the wrapper naively retried the whole stream, a consumer that had already
received `text_delta` chunks would receive them again after a mid-stream
transient error - duplicated output and a corrupted transcript. The
"before first chunk" boundary is the load-bearing correctness rule.

## Suggestion
Implement `stream()` by returning an object whose `[Symbol.asyncIterator]()`
returns a hand-rolled `AsyncIterator`. Track a `started` flag: while
`!started`, wrap `next()` in the transient-retry loop (creating a new inner
iterator on each retry); once the first value is returned, set `started = true`
and delegate every later `next()` to the current inner iterator without retry.
Reuse the same `isTransient`/backoff helpers from TICKET-011.

## Acceptance Criteria
- [ ] A transient failure on the first `next()` is retried (fresh inner stream per attempt)
- [ ] A transient failure after the first chunk is NOT retried (propagates immediately)
- [ ] A non-retryable failure on the first `next()` is NOT retried
- [ ] Chunks after the first are forwarded exactly once, in order, ending in `StreamEnd`
- [ ] On exhaustion the last transient `LlmFailure` is rethrown
