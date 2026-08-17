# TICKET-037 — agent/conversation.ts: the multi-turn Conversation driver

**Cycle:** 11 (Agent loop — the multi-turn conversation driver)
**File:** src/agent/conversation.ts (new)

## Capability
A stateful Conversation that holds the transcript ACROSS turns and reuses the
shared runTurn (TICKET-035) per send(). This is the inversion of the seed's
ReactLoopAgent (src/agent/agent.ts in deepseek-harness): the seed is a class
with a phase state machine (idle/maintenance/running), an Inbox, a Scope, a
Cordis Context, and a RuntimeContextProjection. We INVERT all of that into a
plain stateful object over plain modules. No phase machine, no Inbox, no Scope,
no ctx, no RuntimeContextProjection, no DI.

### Shape
class Conversation:
- constructor(opts: AgentOptions):
    - store opts.
    - transcript: Message[] = []  (private, persistent across turns).
    - if opts.system !== undefined: transcript.push(message("system", [textBlock(opts.system)])).
    - turnCount = 0.
- get turns(): number  ->  this.turnCount  (number of send() calls completed).
- history(): readonly Message[]  ->  a COPY of the current transcript.
- send(userText: string): Promise<AgentResult>:
    - turn = this.turnCount + 1.
    - { steps, end } = await runTurn(this.transcript, this.opts, userText, turn).
      (runTurn appends the user message + this turn's assistant/tool messages to
       this.transcript IN PLACE.)
    - this.turnCount = turn.
    - return { messages: [...this.transcript], turns: this.turnCount, steps, end }.

### Invariants
- The persistent transcript is private. history() and the AgentResult.messages
  both return a COPY, so a caller can mutate the returned array freely without
  affecting the conversation. A SHALLOW copy ([...this.transcript]) is sufficient:
  the array is new (push/splice on it do not touch the internal array) and every
  Message element is deeply frozen (src/llm/message.ts), so elements cannot be
  mutated either.
- messages in the returned AgentResult is the FULL transcript after the turn
  (system?, user1, assistant1, tool?, ..., userN, assistantN) — consistent with
  runAgent returning the full transcript.
- The conversation stays usable after an error / max_steps / aborted turn: the
  next send() continues from the current transcript (runTurn is total, so a
  failed turn leaves the transcript in a consistent, appendable state).
- The turn number threaded to runTurn is the cumulative turn (1, 2, 3, ...), so
  AgentEvents carry the correct turn. (See the turn-number note in TICKET-035.)

### Documented limitation (deliberate inversion)
The seed serializes turns with a phase state machine. The plain Conversation has
NO such guard: concurrent send() calls (two in flight without awaiting the first)
would interleave their in-place transcript mutations. The contract is that the
CALLER serializes send() calls (await each before the next). This is a deliberate
simplification, not a bug to fix this cycle — but it must be stated in the module
docstring so a future reader does not assume reentrancy safety.

## Acceptance
- src/agent/conversation.ts exists; Conversation is a plain class (no DI, no ctx,
  no Cordis, no phase machine, no Inbox, no Scope).
- Constructor seeds the system prompt (if present) into the persistent transcript.
- get turns() returns the number of completed send() calls.
- history() returns a copy; mutating it does not affect a later history().
- send() returns { messages: <full transcript copy>, turns, steps, end }.
- A conversation survives an error / max_steps / aborted turn and continues.
- The module docstring states the caller-serializes-send() contract.
