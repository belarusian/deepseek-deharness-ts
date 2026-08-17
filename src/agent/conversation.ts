/**
 * The **multi-turn conversation driver** of the agent loop (the inner spoke).
 *
 * `Conversation` is a plain stateful object over plain modules — the inversion
 * of the seed's `ReactLoopAgent` (deepseek-harness `agent-loop/src/agent.ts`),
 * which is a class with a phase state machine (idle/maintenance/running), an
 * `Inbox`, a `Scope`, a Cordis `Context`, and a `RuntimeContextProjection`.
 * None of that is present here: no phase machine, no `Inbox`, no `Scope`, no
 * `ctx`, no `RuntimeContextProjection`, no DI. A `Conversation` simply holds a
 * persistent transcript across turns and reuses the shared `runTurn` core per
 * `send()`.
 *
 * The transcript is the load-bearing state: turn N+1 sees turn N's assistant
 * and tool messages because they were appended to the same array in place.
 * `history()` and the `AgentResult.messages` returned by `send()` are both
 * **copies**, so a caller can mutate the returned array freely without
 * affecting the conversation.
 *
 * **Caller-serializes contract (deliberate inversion):** the seed serializes
 * turns with a phase state machine. The plain `Conversation` has no such guard:
 * two `send()` calls in flight without awaiting the first would interleave
 * their in-place transcript mutations. The contract is that the CALLER
 * serializes `send()` calls (await each before the next). This is a deliberate
 * simplification, not a bug to fix here.
 */

import { message, textBlock, type Message } from "../llm/index.js";
import { runTurn } from "./turn.js";
import type { AgentOptions, AgentResult } from "./types.js";

/**
 * A stateful, multi-turn agent conversation.
 *
 * Holds a persistent transcript across turns and reuses the shared `runTurn`
 * core per `send()`. The conversation stays usable after an `error` /
 * `max_steps` / `aborted` turn: the next `send()` continues from the current
 * transcript (the driver is total, so a failed turn leaves the transcript in a
 * consistent, appendable state).
 */
export class Conversation {
  private readonly opts: AgentOptions;
  private readonly transcript: Message[];
  private turnCount = 0;

  constructor(opts: AgentOptions) {
    this.opts = opts;
    this.transcript = [];
    if (opts.system !== undefined) {
      this.transcript.push(message("system", [textBlock(opts.system)]));
    }
  }

  /** The number of `send()` calls completed. */
  get turns(): number {
    return this.turnCount;
  }

  /**
   * A copy of the current transcript. Mutating the returned array does not
   * affect the conversation (the persistent transcript is private, and every
   * `Message` element is deeply frozen).
   */
  history(): readonly Message[] {
    return [...this.transcript];
  }

  /**
   * Run one turn: append the user message and this turn's assistant/tool
   * messages to the persistent transcript (in place, via `runTurn`), and
   * return the full transcript with the cumulative turn count.
   */
  async send(userText: string): Promise<AgentResult> {
    const turn = this.turnCount + 1;
    const { steps, end } = await runTurn(
      this.transcript,
      this.opts,
      userText,
      turn,
    );
    this.turnCount = turn;
    return {
      messages: [...this.transcript],
      turns: this.turnCount,
      steps,
      end,
    };
  }
}
