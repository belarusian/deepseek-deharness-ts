# TICKET-036 — agent/loop.ts: refactor runAgent to a thin wrapper

**Cycle:** 11 (Agent loop — the multi-turn conversation driver)
**File:** src/agent/loop.ts (refactor, public signature unchanged)

## Capability
Refactor runAgent into a thin wrapper over the shared runTurn (TICKET-035).
The public signature and the existing 6 agent.test.ts cases must pass UNCHANGED.

### Public signature (UNCHANGED)
runAgent(opts: AgentOptions, userText: string): Promise<AgentResult>

### New body
1. Build a fresh transcript: Message[] = []. If opts.system !== undefined,
   push message("system", [textBlock(opts.system)]). Do NOT pre-append the user
   message — runTurn appends it itself.
2. Call runTurn(transcript, opts, userText) -> { steps, end }.
3. Return { messages: transcript, turns: 1, steps, end }.

### What moves out
- The entire step/step loop (the for-loop, the abort/budget/adapter/tool
  dispatch, the per-boundary emit calls) moves to runTurn.
- DEFAULT_MAX_STEPS and errorMessage: keep them where they are used. If runTurn
  needs errorMessage, move it to turn.ts (or a shared internal helper) so loop.ts
  does not retain a dead copy. Do not leave an unused import in loop.ts (lint).
- The system-prompt seeding stays in runAgent (the wrapper owns the fresh
  transcript); runTurn only appends the user message + turn traffic.

### Invariants that must hold (the 6 existing cases)
- (a) text-only: end "completed", steps 1, turns 1, [user, assistant].
- (b) tool round-trip: [user, assistant, tool, assistant], tool content "5".
- (c) maxSteps 3: end "max_steps", steps 3.
- (d) unknown tool: isError tool_result, then completed.
- (e) pre-aborted signal: end "aborted", steps 0.
- (f) trajectory order: turn_start, step_start, assistant, tool_call,
  tool_result, step_start, assistant, turn_end — all with turn: 1.

## Acceptance
- runAgent's signature and return shape are unchanged.
- runAgent delegates the loop to runTurn; it no longer contains the for-loop.
- All 6 existing agent.test.ts cases pass unchanged.
- No dead imports / unused symbols in loop.ts (lint clean).
- The system prompt is still seeded by the wrapper, not by runTurn.
