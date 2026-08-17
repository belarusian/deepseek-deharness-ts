# TICKET-042 — Streaming path in the shared runTurn core

**Module:** `src/agent/turn.ts`

## Capability
In the "one model step" block, replace the single `adapter.complete` call with a
stream/complete branch, inside the SAME try/catch.

## Change
    assistant = opts.stream
      ? await assembleAssistant(opts.adapter.stream(transcript, { tools }))
      : await opts.adapter.complete(transcript, { tools });
- A throw from either path -> `end: "error"` (never rethrown).
- Everything else (abort check, step budget, `completed` on no tool calls, tool
  dispatch, per-boundary `onEvent`) is UNCHANGED.
- Import `assembleAssistant` from `../llm/index.js`.

## Constraints
- Do NOT fork a second loop — a single `opts.stream ? stream : complete` branch.
- The existing 6 agent.test.ts + 7 conversation.test.ts cases must pass
  UNCHANGED (they use the default `stream: false`).
