/**
 * The **shared step/turn core** of the agent loop (internal).
 *
 * `runTurn` is the single home of the step/turn loop body. Both the
 * single-turn driver (`runAgent`, in `loop.ts`) and the multi-turn
 * `Conversation` (in `conversation.ts`) delegate to it, so the loop is
 * written exactly once and reused with zero duplication.
 *
 * The caller owns the transcript: `runTurn` does NOT build it. It appends the
 * user message (from `userText`) and then each assistant + tool message of the
 * turn **in place** on the caller's array. `runAgent` passes a fresh array;
 * `Conversation` passes its persistent array.
 *
 * `runTurn` is total: it NEVER throws. Adapter failures are contained into
 * `end: "error"`; an unknown tool name and a malformed argument payload are
 * contained into an `isError` `ToolResultBlock`. Cancellation is observed at
 * the top of each step (`end: "aborted"`), and the per-turn step budget caps
 * the loop (`end: "max_steps"`).
 */

import {
  message,
  textBlock,
  type AssistantMessage,
  type Message,
  type ToolCallBlock,
} from "../llm/index.js";
import {
  executeTool,
  toToolDefinition,
  toToolResultBlock,
  type ToolResult,
} from "../tools/index.js";
import type { AgentEvent, AgentOptions, TurnEndReason } from "./types.js";

/** The default per-turn step budget when `opts.maxSteps` is absent. */
const DEFAULT_MAX_STEPS = 10;

/** Render an unknown thrown value as a safe error string. */
function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

/** The settled outcome of one agent turn (before the caller wraps it). */
export interface TurnOutcome {
  readonly steps: number;
  readonly end: TurnEndReason;
}

/**
 * Drive one agent turn to completion, mutating the caller's transcript in
 * place, and return its settled outcome.
 *
 * Appends the user message to `transcript`, emits `turn_start`, then loops
 * model steps: each step calls the adapter, appends the assistant message, and
 * — if the assistant requested tool calls — dispatches each one through the
 * guarded pipeline and appends the tool result. The loop ends when the
 * assistant stops requesting tools (`completed`), the step budget is hit
 * (`max_steps`), the signal aborts (`aborted`), or the adapter throws
 * (`error`).
 *
 * `turn` is the turn number carried by the emitted `AgentEvent`s (default 1).
 * `runAgent` omits it (a single-turn driver is always turn 1); `Conversation`
 * passes its cumulative turn so multi-turn trajectories carry `turn: 2, 3, ...`.
 */
export async function runTurn(
  transcript: Message[],
  opts: AgentOptions,
  userText: string,
  turn?: number,
): Promise<TurnOutcome> {
  const maxSteps = opts.maxSteps ?? DEFAULT_MAX_STEPS;
  const t = turn ?? 1;
  const tools = opts.tools.all().map(toToolDefinition);
  const emit = (event: AgentEvent): void => {
    if (opts.onEvent) opts.onEvent(event);
  };

  // ── append the user message (the caller owns the transcript) ─────────────
  transcript.push(message("user", [textBlock(userText)]));

  emit({ type: "turn_start", turn: t });

  let end: TurnEndReason;
  let steps = 0;

  for (let step = 1; ; step++) {
    // ── cancellation (observed at the top of each step) ────────────────────
    if (opts.signal?.aborted) {
      end = "aborted";
      break;
    }
    // ── step budget ─────────────────────────────────────────────────────────
    if (step > maxSteps) {
      end = "max_steps";
      break;
    }
    steps = step;
    emit({ type: "step_start", turn: t, step });

    // ── one model step (adapter failures are contained, never thrown) ──────
    let assistant: AssistantMessage;
    try {
      assistant = await opts.adapter.complete(transcript, { tools });
    } catch {
      end = "error";
      break;
    }
    transcript.push(assistant);
    emit({ type: "assistant", turn: t, step, message: assistant });

    // ── no tool calls: the turn is complete ────────────────────────────────
    const calls = assistant.blocks.filter(
      (b): b is ToolCallBlock => b.type === "tool_call",
    );
    if (calls.length === 0) {
      end = "completed";
      break;
    }

    // ── dispatch each requested tool call ───────────────────────────────────
    for (const call of calls) {
      emit({ type: "tool_call", turn: t, step, call });
      const tool = opts.tools.get(call.name);
      let result: ToolResult;
      if (!tool) {
        result = { content: `unknown tool: ${call.name}`, isError: true };
      } else {
        try {
          const args = JSON.parse(call.arguments);
          result = await executeTool(tool, args, { signal: opts.signal });
        } catch (err) {
          result = {
            content: `tool "${call.name}" failed: ${errorMessage(err)}`,
            isError: true,
          };
        }
      }
      const block = toToolResultBlock(call.id, result);
      transcript.push(message("tool", [block], call.id));
      emit({ type: "tool_result", turn: t, step, result: block });
    }
  }

  emit({ type: "turn_end", turn: t, reason: end });
  return { steps, end };
}
