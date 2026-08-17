# TICKET-044 — Vitest coverage: `src/__tests__/agent-stream.test.ts`

**Module:** `src/__tests__/agent-stream.test.ts` (new)

## Capability
Deterministic coverage of the streaming path. Use `FakeLlmAdapter` with explicit
`chunks` (no network/fs/`Date.now()`). Import from `../index.js`.

## Cases
(a) **streaming text-only turn** — `ScriptedResponse` with
    chunks: [textDelta("Hel"), textDelta("lo")] -> end "completed", transcript
    [user, assistant], assistant text "Hello".
(b) **streaming tool round-trip** — turn 1
    chunks: [toolCallDelta("c1","add",'{"a":2'), toolCallDelta("c1","add",',"b":3}')]
    (arguments concatenated across deltas) -> add(2,3) -> tool_result content
    "5" -> turn 2 text -> completed, transcript [user, assistant, tool, assistant].
(c) **streaming with usage** — chunks including usageInfo(10,5) and a StreamEnd
    with usage -> turn completes, assembled assistant message well-formed.
(d) **streaming error containment** — an inline LlmAdapter whose `stream` returns
    a stream that throws on next() -> end "error", driver stays total (a
    subsequent fresh turn still works).
(e) **streaming abort** — a pre-aborted signal -> end "aborted", steps 0.
(f) **default path regression** — `stream` omitted (default false) still uses
    adapter.complete (a FakeLlmAdapter scripted with a plain message, no chunks,
    completes as before).

## Constraints
- The existing 13 agent/conversation cases pass UNCHANGED.
- `stream: true` is the only new option exercised.
