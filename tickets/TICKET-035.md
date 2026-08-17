# TICKET-035 — agent/turn.ts: the shared step/turn core (internal)

**Cycle:** 11 (Agent loop — the multi-turn conversation driver)
**File:** src/agent/turn.ts (new)

## Capability
Extract the step/turn loop body out of runAgent (src/agent/loop.ts, cycle 10)
into a single shared internal function so that both the single-turn driver and
the new Conversation reuse the EXACT loop with zero duplication. This is the
load-bearing refactor of the cycle.

### Signature
runTurn(transcript: Message[], opts: AgentOptions, userText: string): Promise<TurnOutcome>
where TurnOutcome = { steps: number; end: TurnEndReason }.

### Contract
- The caller owns the transcript. runTurn does NOT build it. It appends the
  user message (from userText) to transcript itself, then appends each assistant
  + tool message IN PLACE as the turn progresses. runAgent passes a fresh array;
  Conversation passes its persistent array.
- It does NOT wrap the result in an AgentResult. It returns only { steps, end };
  the caller assembles the AgentResult (it knows turns and whether to copy).
- It is total — never throws. Adapter failure -> end: "error"; unknown tool /
  malformed args -> contained isError tool_result.

### The loop body (moved VERBATIM from runAgent in src/agent/loop.ts)
1. maxSteps = opts.maxSteps ?? 10 (reuse DEFAULT_MAX_STEPS).
2. tools = opts.tools.all().map(toToolDefinition); emit closure over opts.onEvent.
3. Append the user message: transcript.push(message("user", [textBlock(userText)])).
4. Emit turn_start (turn number supplied by the caller — see note below).
5. Loop step = 1, 2, ...:
   a. signal?.aborted -> end = "aborted", break.
   b. step > maxSteps -> end = "max_steps", break.
   c. steps = step; emit step_start.
   d. assistant = await opts.adapter.complete(transcript, { tools }); a throw is
      contained -> end = "error", break (never rethrown).
   e. transcript.push(assistant); emit assistant.
   f. calls = assistant.blocks.filter(b => b.type === "tool_call"); if empty ->
      end = "completed", break.
   g. For each ToolCallBlock: emit tool_call; tool = opts.tools.get(call.name);
      absent -> isError result "unknown tool: <name>"; else
      result = await executeTool(tool, JSON.parse(call.arguments), { signal })
      (a throw -> contained isError result). block = toToolResultBlock(call.id,
      result); transcript.push(message("tool", [block], call.id)); emit tool_result.
6. Emit turn_end. Return { steps, end }.

### Note: the turn number in events
The cycle-10 loop hard-codes turn = 1 in every AgentEvent. runTurn must accept
the turn number so Conversation can emit turn: 2, 3, .... Either add an optional
turn?: number parameter (default 1) to runTurn, or thread it through. runAgent
passes 1 (or omits it); Conversation.send passes this.turnCount (the turn about
to run). The existing 6 agent.test.ts cases assert turn: 1, so the default must
preserve that.

## Acceptance
- src/agent/turn.ts exists; runTurn is the single home of the loop body.
- runTurn mutates the caller's transcript in place; it does not build it.
- runTurn returns { steps, end } (not an AgentResult).
- runTurn never throws.
- The loop body is the cycle-10 logic with no behavior change.
- TurnOutcome is exported from this module but NOT re-exported at the top level.
