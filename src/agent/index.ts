/**
 * Public API of the agent loop (the inner spoke).
 *
 * Re-exported so downstream modules compose the loop and its vocabulary by
 * direct import.
 */

export { runAgent } from "./loop.js";
export type {
  AgentOptions,
  AgentEvent,
  TurnEndReason,
  AgentResult,
} from "./types.js";
