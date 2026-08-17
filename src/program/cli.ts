/**
 * The **on-PATH program entrypoint** — a thin, testable CLI (TICKET-051).
 *
 * The inversion of the seed's Cordis launcher: no plugin tree, no DI, no
 * profiles — just a plain module that composes the spokes by direct import and
 * runs one turn. It is a plain module, not a process: `main` parses `argv`,
 * composes a {@link Program}, and returns the `ProgramResult`. No
 * `process.exit`, no `console.log` — a real launcher would print the result.
 *
 * Deterministic and dependency-free: when `opts` omits the adapter, the CLI
 * defaults to a `FakeLlmAdapter` scripted to a single text turn (no network),
 * and the built-in tools.
 */

import {
  assistantMessage,
  textBlock,
  FakeLlmAdapter,
  type LlmAdapter,
  type CallOptions,
} from "../llm/index.js";
import {
  ToolRegistry,
  echoTool,
  addTool,
  failTool,
} from "../tools/index.js";
import { Program } from "./program.js";
import type { ProgramResult } from "./program.js";
import type { AgentEvent } from "../agent/index.js";

/** The options a caller may pass to {@link main}; all optional. */
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
  readonly json?: boolean;
  readonly list?: boolean;
  readonly model?: string;
  readonly maxTokens?: number;
  readonly onEvent?: (event: AgentEvent) => void;
}

/** The parsed shape of an `argv` array. */
interface ParsedArgv {
  readonly userText: string | undefined;
  readonly sessionId: string | undefined;
  readonly logPath: string | undefined;
  readonly resume: boolean;
  readonly stream: boolean;
  readonly maxSteps: number | undefined;
  readonly system: string | undefined;
  readonly json: boolean;
  readonly list: boolean;
  readonly model: string | undefined;
  readonly maxTokens: number | undefined;
}

/**
 * Parse `argv`: the first non-flag token is the user text; `--session <path>`
 * sets `logPath`; `--id <id>` sets `sessionId`; `--resume` sets `resume`;
 * `--stream` sets `stream`; `--max-steps <n>` sets `maxSteps`; `--system
 * <text>` sets `system`; `--json` sets `json`; `--list` sets `list` (both
 * no-value flags, so they are never swallowed as user text); `--model <name>`
 * sets `model`; `--max-tokens <n>` sets `maxTokens` (both value flags, like
 * `--max-steps`).
 */
function parseArgv(argv: readonly string[]): ParsedArgv {
  let userText: string | undefined;
  let sessionId: string | undefined;
  let logPath: string | undefined;
  let resume = false;
  let stream = false;
  let maxSteps: number | undefined;
  let system: string | undefined;
  let json = false;
  let list = false;
  let model: string | undefined;
  let maxTokens: number | undefined;

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === "--session") {
      logPath = argv[++i];
    } else if (token === "--id") {
      sessionId = argv[++i];
    } else if (token === "--resume") {
      resume = true;
    } else if (token === "--stream") {
      stream = true;
    } else if (token === "--max-steps") {
      maxSteps = Number(argv[++i]);
    } else if (token === "--system") {
      system = argv[++i];
    } else if (token === "--json") {
      json = true;
    } else if (token === "--list") {
      list = true;
    } else if (token === "--model") {
      model = argv[++i];
    } else if (token === "--max-tokens") {
      maxTokens = Number(argv[++i]);
    } else if (userText === undefined) {
      userText = token;
    }
    // A non-flag token after the user text is ignored.
  }

  return {
    userText,
    sessionId,
    logPath,
    resume,
    stream,
    maxSteps,
    system,
    json,
    list,
    model,
    maxTokens,
  };
}

/** The default adapter: a `FakeLlmAdapter` scripted to one text turn. */
function defaultAdapter(): LlmAdapter {
  return new FakeLlmAdapter([
    { message: assistantMessage([textBlock("ok")], "stop") },
  ]);
}

/** The default tools: the built-ins (`echo`, `add`, `fail`). */
function defaultTools(): ToolRegistry {
  const tools = new ToolRegistry();
  tools.add(echoTool);
  tools.add(addTool);
  tools.add(failTool);
  return tools;
}

/**
 * The on-PATH program entrypoint. Parse `argv`, compose a {@link Program}
 * (resolving each option as `argv flag` > `opts` > default), optionally
 * `resume()` it, run one turn, and return the `ProgramResult`.
 */
export async function main(
  argv: readonly string[],
  opts?: CliOptions,
): Promise<ProgramResult> {
  const parsed = parseArgv(argv);

  const sessionId = parsed.sessionId ?? opts?.sessionId ?? "session";
  const logPath = parsed.logPath ?? opts?.logPath ?? ".deepseek/session.jsonl";
  const resume = parsed.resume || opts?.resume === true;
  const stream = parsed.stream || opts?.stream === true;
  const maxSteps = parsed.maxSteps ?? opts?.maxSteps;
  const system = parsed.system ?? opts?.system;
  const adapter = opts?.adapter ?? defaultAdapter();
  const tools = opts?.tools ?? defaultTools();
  const clock = opts?.clock ?? (() => 0);

  const model = parsed.model ?? opts?.model;
  const maxTokens = parsed.maxTokens ?? opts?.maxTokens;
  const callOptions: CallOptions | undefined =
    model !== undefined || maxTokens !== undefined
      ? { model, maxTokens }
      : undefined;

  const program = new Program({
    adapter,
    tools,
    sessionId,
    logPath,
    system,
    maxSteps,
    stream,
    clock,
    callOptions,
    onEvent: opts?.onEvent,
  });
  if (resume) {
    await program.resume();
  }
  return program.run(parsed.userText ?? "");
}
