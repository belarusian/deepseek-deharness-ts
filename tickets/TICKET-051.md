# TICKET-051 — The on-PATH program entrypoint (thin, testable CLI)

**Module:** `src/program/cli.ts`

## Capability
The **on-PATH program entrypoint** — a thin, testable CLI. The inversion of the
seed's Cordis launcher: no plugin tree, no DI, no profiles — just a plain module
that composes the spokes by direct import and runs one turn.

## Signatures
```ts
export interface CliOptions {
  readonly adapter?: LlmAdapter;
  readonly tools?: ToolRegistry;
  readonly sessionId?: string;
  readonly logPath?: string;
  readonly system?: string;
  readonly maxSteps?: number;
  readonly stream?: boolean;
  readonly clock?: () => number;
  readonly resume?: boolean;
}

export async function main(argv: readonly string[], opts?: CliOptions): Promise<ProgramResult>;
```

## Behavior
- Parse `argv`: the user text is the first non-flag token; `--session <path>` sets
  `logPath`; `--id <id>` sets `sessionId`; `--resume` sets `resume`; `--stream`
  sets `stream`; `--max-steps <n>` sets `maxSteps`; `--system <text>` sets `system`.
- Defaults (when `opts` does not supply them): `adapter` = a `FakeLlmAdapter`
  scripted to answer a single text turn (so the CLI is runnable + testable with
  **no network**); `tools` = a `ToolRegistry` preloaded with the built-ins
  (`echoTool`, `addTool`, `failTool`); `sessionId` = `"session"`;
  `logPath` = `".deepseek/session.jsonl"`; `clock` = `() => 0` (deterministic).
- Build a `Program`, and if `resume` is set call `await program.resume()` first,
  then `return program.run(userText)`.
- **No `process.exit`, no `console.log` inside `main`** (keep it pure-ish and
  testable: it returns the `ProgramResult`; a real launcher would print it).

## Constraints
- The CLI is a plain module, not a process.
- Deterministic and dependency-free.
