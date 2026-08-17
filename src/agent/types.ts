/**
 * The **agent loop** vocabulary (the inner spoke: work + trajectory).
 *
 * Plain TypeScript types only — no runtime values, no classes, no side
 * effects. The loop composes the LLM seam's message vocabulary
 * (`AssistantMessage`, `ToolCallBlock`, `ToolResultBlock`, `Message`) and the
 * tools `ToolRegistry` by direct import; nothing here redefines them.
 */

import type {
  AssistantMessage,
  ToolCallBlock,
  ToolResultBlock,
  Message,
  LlmAdapter,
} from "../llm/index.js";
import type { ToolRegistry } from "../tools/index.js";

/** Why a turn stopped. */
export type TurnEndReason = "completed" | "max_steps" | "aborted" | "error";

/**
 * The options the agent loop is driven with.
 *
 * `adapter` is the LLM seam the loop calls; `tools` is the registry the loop
 * dispatches tool calls against. `system` is an optional system prompt,
 * `maxSteps` caps the per-turn step budget (default 10), `signal` is the
 * caller's cancellation token, and `onEvent` is the trajectory observer.
 */
export interface AgentOptions {
  readonly adapter: LlmAdapter;
  readonly tools: ToolRegistry;
  readonly system?: string;
  readonly maxSteps?: number;
  readonly signal?: AbortSignal;
  readonly onEvent?: (event: AgentEvent) => void;
}

/**
 * The trajectory events the loop emits, in order. Each carries the turn and
 * (where applicable) step it belongs to, plus the payload it describes.
 */
export type AgentEvent =
  | { type: "turn_start"; turn: number }
  | { type: "step_start"; turn: number; step: number }
  | { type: "assistant"; turn: number; step: number; message: AssistantMessage }
  | { type: "tool_call"; turn: number; step: number; call: ToolCallBlock }
  | { type: "tool_result"; turn: number; step: number; result: ToolResultBlock }
  | { type: "turn_end"; turn: number; reason: TurnEndReason };

/** The settled outcome of one agent turn. */
export interface AgentResult {
  readonly messages: readonly Message[];
  readonly turns: number;
  readonly steps: number;
  readonly end: TurnEndReason;
}
