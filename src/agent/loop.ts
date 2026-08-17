/**
 * The **agent loop** (the inner spoke: work + trajectory).
 *
 * `runAgent` is a plain async function — no class, no DI, no `ctx`, no Cordis
 * event seams. It is a thin wrapper over the shared step/turn core
 * (`runTurn`, in `turn.ts`): it builds a fresh transcript (the optional system
 * prompt), delegates the whole turn to `runTurn`, and wraps the outcome in an
 * `AgentResult`. The multi-turn `Conversation` (in `conversation.ts`) reuses
 * the same `runTurn` over a persistent transcript, so the loop body is written
 * exactly once.
 *
 * The driver is total: it NEVER throws. Adapter failures are contained into
 * `end: "error"`; an unknown tool name is contained into an `isError`
 * `ToolResultBlock`; a malformed argument payload is contained the same way.
 * Cancellation is observed at the top of each step (`end: "aborted"`), and the
 * per-turn step budget caps the loop (`end: "max_steps"`).
 */

import { message, textBlock, type Message } from "../llm/index.js";
import { runTurn } from "./turn.js";
import type { AgentOptions, AgentResult } from "./types.js";

/**
 * Drive one agent turn to completion and return its settled result.
 *
 * Builds a fresh transcript from the optional system prompt (the user message
 * is appended by `runTurn`), delegates the turn to the shared `runTurn` core,
 * and returns the full transcript with `turns: 1`.
 */
export async function runAgent(
  opts: AgentOptions,
  userText: string,
): Promise<AgentResult> {
  // ── transcript: optional system prompt (runTurn appends the user message) ─
  const transcript: Message[] = [];
  if (opts.system !== undefined) {
    transcript.push(message("system", [textBlock(opts.system)]));
  }

  const { steps, end } = await runTurn(transcript, opts, userText);
  return { messages: transcript, turns: 1, steps, end };
}
