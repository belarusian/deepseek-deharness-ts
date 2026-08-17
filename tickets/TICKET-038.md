# TICKET-038 — agent/index.ts + src/index.ts: export Conversation

**Cycle:** 11 (Agent loop — the multi-turn conversation driver)
**Files:** src/agent/index.ts (edit), src/index.ts (edit)

## Capability
Surface the new Conversation in the public API while keeping the internal
runTurn / TurnOutcome OUT of the top-level surface.

### src/agent/index.ts (the agent barrel)
- Add: export { Conversation } from "./conversation.js";
- Keep the existing runAgent re-export and the type re-exports
  (AgentOptions, AgentEvent, TurnEndReason, AgentResult).
- Do NOT re-export runTurn or TurnOutcome from this barrel. They are internal to
  the agent module (loop.ts and conversation.ts import them directly from
  ./turn.js). If a type re-export of TurnOutcome is ever needed, it is not part
  of this cycle's public surface.

### src/index.ts (the package root)
- Add Conversation to the existing agent re-export block (the one that already
  re-exports runAgent + AgentOptions + AgentEvent + TurnEndReason + AgentResult
  from ./agent/index.js).
- Do NOT re-export runTurn or TurnOutcome at the root.

### Naming-collision check (already handled, do not regress)
src/index.ts deliberately does NOT re-export the LLM seam's AssistantMessage
because the session module exports a same-named (distinct) AssistantMessage.
Conversation does not introduce a new collision: it exports only the class name
Conversation. Verify no other module exports a Conversation symbol.

## Acceptance
- import { Conversation } from "deepseek-deharness-ts" (or from ./index.js) works.
- import { runAgent } from ... still works (unchanged).
- runTurn and TurnOutcome are NOT reachable from the package root or the agent
  barrel (they are internal).
- npm run build clean; no duplicate-export / name-collision errors.
