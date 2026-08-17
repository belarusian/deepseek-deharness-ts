# TICKET-039 — src/__tests__/conversation.test.ts: vitest coverage

**Cycle:** 11 (Agent loop — the multi-turn conversation driver)
**File:** src/__tests__/conversation.test.ts (new)

## Capability
Deterministic, dependency-free vitest coverage of Conversation using
FakeLlmAdapter (scripted queue) + the built-in addTool. No network, no
filesystem, no Date.now().

## Cases
- (a) **two text-only turns** — adapter scripted [text1, text2]; two send()
  calls. After both: conv.turns === 2, each result.end === "completed", and
  history() roles are [user, assistant, user, assistant] (or
  [system, user, assistant, user, assistant] when opts.system is set).
- (b) **transcript persists across turns** — adapter scripted
  [toolCall(add, {a:2,b:3}), text1, text2]; turn 1 does the tool round-trip
  (add(2,3) -> tool_result content "5") then a text reply; turn 2 is text-only.
  Assert the final history() role order is
  [user, assistant, tool, assistant, user, assistant] and that the turn-1 tool
  message sits BEFORE the turn-2 assistant message. (The fake adapter is
  scripted and ignores its input, so the transcript-order assertion is the
  deterministic proxy for "turn 2 was produced from the full history".)
- (c) **maxSteps within a turn, then recovery** — adapter scripted
  [toolCall, toolCall, toolCall, text]; opts.maxSteps = 3. First send() ends
  "max_steps" with steps 3 (the 3 tool-call responses are consumed). A
  subsequent send() consumes the text response and ends "completed".
- (d) **error containment, then recovery** — a turn whose adapter throws yields
  end "error" for that turn, and the conversation is still usable on the next
  turn (which ends "completed"). NOTE: FakeLlmAdapter throws only on queue
  exhaustion (every call once empty), so it cannot throw on exactly one turn and
  then succeed. Use a minimal inline LlmAdapter for this case:
    let calls = 0;
    const adapter: LlmAdapter = {
      complete: async () => {
        calls++;
        if (calls === 1) throw new Error("boom");
        return assistantMessage([textBlock("recovered")]);
      },
      stream: () => { throw new Error("not used"); },
    };
  This is still deterministic and dependency-free (no network/fs/Date.now()).
- (e) **abort** — a pre-aborted AbortSignal yields end "aborted" (steps 0).
  Consistent with cycle 10, the user message is appended to the transcript
  BEFORE the abort check, so history() after the aborted send() ends with the
  user message and no assistant reply. The conversation is still usable after.
- (f) **history() immutability** — const h = conv.history(); h.push(...); a
  later conv.history() is unchanged (the returned array is a copy; elements are
  frozen so element mutation is impossible).

## Acceptance
- All cases pass deterministically (FakeLlmAdapter + addTool; the one inline
  adapter in (d) is the only non-FakeLlmAdapter, and it is dependency-free).
- npm test green; npm run lint clean.
- The test imports Conversation from ../index.js (the public surface), proving
  the TICKET-038 export is reachable.
