/**
 * Public API of the agent loop (the inner spoke).
 *
 * Re-exported so downstream modules compose the loop and its vocabulary by
 * direct import. The internal step/turn core (`runTurn` / `TurnOutcome`, in
 * `turn.ts`) is deliberately NOT re-exported here: it is internal to the agent
 * module (`loop.ts` and `conversation.ts` import it directly from `./turn.js`).
 */

export { runAgent } from "./loop.js";
export { Conversation } from "./conversation.js";
export { toSessionEvent } from "./trajectory.js";
export type {
  AgentOptions,
  AgentEvent,
  TurnEndReason,
  AgentResult,
} from "./types.js";
