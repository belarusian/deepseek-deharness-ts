/**
 * The **on-disk Program** — the four-algebra composition (TICKET-050).
 *
 * A plain `Program` class that owns one session: an `LlmAdapter`, a
 * `ToolRegistry`, and a durable `SessionLog`. It drives the agent loop with
 * the log, **persists the log to disk after every turn**, and can **resume**
 * an existing on-disk log.
 *
 * It is also a **true in-memory multi-turn driver**: `run()` accumulates the
 * transcript in place (mirroring the inner-spoke `Conversation.send`), so a
 * second `run()` on the same `Program` sees the first turn's messages. The
 * cumulative turn count is tracked and `history()` exposes a copy of the
 * accumulated transcript. `resume()` remains the durable (on-disk) path.
 *
 * The loop is NOT forked: `run()` delegates to the shared step/turn core
 * (`runTurn`, in `../agent/turn.js`) — the exact same core `runAgent` uses.
 * The Program only adds the durable-log ownership and the on-disk persistence
 * + resume seam around that shared core.
 *
 * Persistence is an explicit call (`writeLog` once at the end of the turn),
 * never a hidden side effect. `resume` seeds (it does not replay): it reads
 * the on-disk log, seeds a fresh `SessionLog` from the prior events, and
 * rebuilds the transcript from the seed's surface messages so the model sees
 * prior turns.
 */

import {
  message,
  textBlock,
  toolResultBlock,
  type Message,
} from "../llm/index.js";
import type { LlmAdapter, CallOptions } from "../llm/index.js";
import type { ToolRegistry } from "../tools/index.js";
import { SessionLog } from "../session/log.js";
import type { SessionEvent } from "../session/event.js";
import { readLog, writeLog } from "../session/store.js";
import { runTurn } from "../agent/turn.js";
import type { AgentOptions, AgentResult } from "../agent/types.js";
import type { AgentEvent } from "../agent/index.js";

/** The options that compose one on-disk {@link Program}. */
export interface ProgramOptions {
  readonly adapter: LlmAdapter;
  readonly tools: ToolRegistry;
  readonly sessionId: string;
  readonly logPath: string;
  readonly system?: string;
  readonly maxSteps?: number;
  readonly stream?: boolean;
  readonly clock?: () => number;
  readonly callOptions?: CallOptions;
  readonly onEvent?: (event: AgentEvent) => void;
}

/** The settled outcome of one {@link Program.run} call. */
export interface ProgramResult {
  readonly result: AgentResult;
  readonly logPath: string;
  readonly log: SessionLog;
}

/**
 * Rebuild one LLM `Message` from a surface `SessionEvent` — the inverse of the
 * `toSessionEvent` flattening: a `content` string becomes a single `textBlock`.
 * Returns `null` for non-surface events (turn/step markers).
 */
function surfaceEventToMessage(event: SessionEvent): Message | null {
  switch (event.type) {
    case "user/message":
      return message("user", [textBlock(event.data.content)]);
    case "assistant/message":
      return message("assistant", [textBlock(event.data.message.content)]);
    case "tool/result":
      return message(
        "tool",
        [
          toolResultBlock(
            event.data.message.callId,
            event.data.message.content,
            event.data.error ? true : undefined,
          ),
        ],
        event.data.message.callId,
      );
    default:
      return null;
  }
}

/**
 * The on-disk Program: one session, one durable log, one shared loop core.
 */
export class Program {
  readonly #adapter: LlmAdapter;
  readonly #tools: ToolRegistry;
  readonly #system: string | undefined;
  readonly #maxSteps: number | undefined;
  readonly #stream: boolean | undefined;
  readonly #clock: (() => number) | undefined;
  readonly #callOptions: CallOptions | undefined;
  readonly #onEvent: ((event: AgentEvent) => void) | undefined;
  readonly logPath: string;
  readonly sessionId: string;
  #log: SessionLog;
  #opts: AgentOptions;
  #transcript: Message[];
  #turnCount = 0;

  constructor(opts: ProgramOptions) {
    this.#adapter = opts.adapter;
    this.#tools = opts.tools;
    this.#system = opts.system;
    this.#maxSteps = opts.maxSteps;
    this.#stream = opts.stream;
    this.#clock = opts.clock;
    this.#callOptions = opts.callOptions;
    this.#onEvent = opts.onEvent;
    this.logPath = opts.logPath;
    this.sessionId = opts.sessionId;
    this.#log = new SessionLog(opts.sessionId, { clock: this.#clock });
    this.#opts = this.#buildOpts();
    this.#transcript = this.#buildTranscript();
  }

  /** The durable session log (replaced by {@link resume}). */
  get log(): SessionLog {
    return this.#log;
  }

  /** The number of turns completed (cumulative across `run()` calls). */
  get turns(): number {
    return this.#turnCount;
  }

  /** Build the `AgentOptions` the shared core is driven with. */
  #buildOpts(): AgentOptions {
    return {
      adapter: this.#adapter,
      tools: this.#tools,
      system: this.#system,
      maxSteps: this.#maxSteps,
      stream: this.#stream,
      log: this.#log,
      callOptions: this.#callOptions,
      onEvent: this.#onEvent,
    };
  }

  /**
   * Build the transcript prefix: the optional system prompt, plus (on resume)
   * the seed events' surface messages so the model sees prior turns.
   */
  #buildTranscript(seedEvents?: readonly SessionEvent[]): Message[] {
    const transcript: Message[] = [];
    if (this.#system !== undefined) {
      transcript.push(message("system", [textBlock(this.#system)]));
    }
    if (seedEvents) {
      for (const event of seedEvents) {
        const m = surfaceEventToMessage(event);
        if (m) transcript.push(m);
      }
    }
    return transcript;
  }

  /**
   * Drive one turn through the shared core, persist the log to disk, and
   * return the settled result.
   *
   * The turn is driven on the **persistent** `#transcript` in place (mirroring
   * `Conversation.send`), so a second `run()` on the same `Program` sees the
   * first turn's messages. `turn` is the cumulative trajectory turn index
   * (1 for a fresh single-turn `run`, unchanged from before). `messages` in the
   * returned `AgentResult` is a **copy** — the persistent transcript stays
   * private.
   */
  async run(userText: string): Promise<ProgramResult> {
    const turn = this.#turnCount + 1;
    const { steps, end } = await runTurn(
      this.#transcript,
      this.#opts,
      userText,
      turn,
    );
    this.#turnCount = turn;
    const result: AgentResult = {
      messages: [...this.#transcript],
      turns: this.#turnCount,
      steps,
      end,
    };
    writeLog(this.logPath, this.#log);
    return { result, logPath: this.logPath, log: this.#log };
  }

  /**
   * A copy of the current accumulated transcript. Mutating the returned array
   * does not affect the Program (the persistent `#transcript` is private),
   * mirroring `Conversation.history()`.
   */
  history(): readonly Message[] {
    return [...this.#transcript];
  }

  /**
   * Seed a fresh `SessionLog` from the on-disk log at `this.logPath`, replace
   * `this.log` and the `AgentOptions.log` reference, and rebuild the
   * transcript from the seed's surface messages. Returns `this` so
   * `await program.resume().run(text)` continues the same session with
   * contiguous `seq` across the reload.
   */
  async resume(): Promise<Program> {
    const { header, events } = readLog(this.logPath);
    this.#log = new SessionLog(header.id, {
      seed: events,
      header,
      clock: this.#clock,
    });
    this.#opts = this.#buildOpts();
    this.#transcript = this.#buildTranscript(events);
    // Reset the trajectory turn index to the seed's turn count (the number of
    // turn/start events) so the next run() continues with the correct index.
    this.#turnCount = events.filter((e) => e.type === "turn/start").length;
    return this;
  }
}
