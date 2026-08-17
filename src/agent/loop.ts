/**
 * The **agent loop** (the inner spoke: work + trajectory).
 *
 * `runAgent` is a plain async function — no class, no DI, no `ctx`, no Cordis
 * event seams. It composes the LLM seam and the tools module by direct import:
 * `adapter.complete` for each model step, `executeTool` / `toToolDefinition` /
 * `toToolResultBlock` for tool dispatch, and the `message` / `textBlock`
 * builders for the transcript.
 *
 * The driver is total: it NEVER throws. Adapter failures are contained into
 * `end: "error"`; an unknown tool name is contained into an `isError`
 * `ToolResultBlock`; a malformed argument payload is contained the same way.
 * Cancellation is observed at the top of each step (`end: "aborted"`), and the
 * per-turn step budget caps the loop (`end: "max_steps"`).
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
import type { AgentEvent, AgentOptions, AgentResult, TurnEndReason } from "./types.js";

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

/**
 * Drive one agent turn to completion and return its settled result.
 *
 * Builds the transcript from the optional system prompt and the user text,
 * then loops model steps: each step calls the adapter, appends the assistant
 * message, and — if the assistant requested tool calls — dispatches each one
 * through the guarded pipeline and appends the tool result. The loop ends when
 * the assistant stops requesting tools (`completed`), the step budget is hit
 * (`max_steps`), the signal aborts (`aborted`), or the adapter throws
 * (`error`).
 */
export async function runAgent(
  opts: AgentOptions,
  userText: string,
): Promise<AgentResult> {
  const maxSteps = opts.maxSteps ?? DEFAULT_MAX_STEPS;
  const turn = 1;
  const tools = opts.tools.all().map(toToolDefinition);
  const emit = (event: AgentEvent): void => {
    if (opts.onEvent) opts.onEvent(event);
  };

  // ── transcript: optional system prompt, then the user message ────────────
  const transcript: Message[] = [];
  if (opts.system !== undefined) {
    transcript.push(message("system", [textBlock(opts.system)]));
  }
  transcript.push(message("user", [textBlock(userText)]));

  emit({ type: "turn_start", turn });

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
    emit({ type: "step_start", turn, step });

    // ── one model step (adapter failures are contained, never thrown) ──────
    let assistant: AssistantMessage;
    try {
      assistant = await opts.adapter.complete(transcript, { tools });
    } catch {
      end = "error";
      break;
    }
    transcript.push(assistant);
    emit({ type: "assistant", turn, step, message: assistant });

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
      emit({ type: "tool_call", turn, step, call });
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
      emit({ type: "tool_result", turn, step, result: block });
    }
  }

  emit({ type: "turn_end", turn, reason: end });
  return { messages: transcript, turns: 1, steps, end };
}
