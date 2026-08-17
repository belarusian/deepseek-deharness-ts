# TICKET-050 — The on-disk Program (four-algebra composition)

**Module:** `src/program/program.ts`

## Capability
The **on-disk Program** — the four-algebra composition. A plain `Program` class
that owns one session (an `LlmAdapter` + a `ToolRegistry` + a `SessionLog`),
drives the agent loop with the durable log, **persists the log to disk after
every turn**, and can **resume** an existing on-disk log.

## Signatures
```ts
export interface ProgramOptions {
  readonly adapter: LlmAdapter;
  readonly tools: ToolRegistry;
  readonly sessionId: string;
  readonly logPath: string;
  readonly system?: string;
  readonly maxSteps?: number;
  readonly stream?: boolean;
  readonly clock?: () => number;
}

export interface ProgramResult {
  readonly result: AgentResult;
  readonly logPath: string;
  readonly log: SessionLog;
}

export class Program {
  constructor(opts: ProgramOptions);
  readonly log: SessionLog;
  readonly logPath: string;
  run(userText: string): Promise<ProgramResult>;
  resume(): Promise<Program>;
}
```

## Behavior
- Constructor builds a `SessionLog` (`new SessionLog(opts.sessionId, { clock: opts.clock })`)
  and holds the `AgentOptions` it will drive the loop with
  (`{ adapter, tools, system, maxSteps, stream, log }`).
- **`run(userText)`** — drive **one turn** through the shared core: build a fresh
  transcript (optional system prompt), call `runTurn(transcript, this.opts, userText)`
  (the exact same core `runAgent` uses — do NOT fork a second loop), then **persist**
  the log to disk via `writeLog(this.logPath, this.log)`, and return
  `{ result: AgentResult, logPath, log }`.
- **`resume()`** — load the on-disk log at `this.logPath` via `readLog`, **seed** a
  fresh `SessionLog` from the prior events
  (`new SessionLog(header.id, { seed: events, header, clock })`), replace `this.log`
  with it, update the `AgentOptions.log` reference, and return `this` (so
  `await program.resume().run(text)` continues the same session with **contiguous
  `seq`** across the reload).
- **Transcript seeding on resume:** rebuild the transcript from the seed events'
  surface messages (user/assistant/tool) so the model sees prior turns — map the
  `user/message`, `assistant/message`, and `tool/result` events back to LLM
  `Message`s (the inverse of the `toSessionEvent` flattening: `content` string →
  a single `textBlock`). Keep this mapping small and local to `program.ts`.

## Constraints
- Reuse the shared core; do not fork a loop.
- Persistence is an explicit call (`writeLog` once at the end of the turn), never a
  hidden side effect. `SessionLog.append` is unchanged.
- `resume` seeds, it does not replay.
- No new npm deps.
