/**
 * The **process-level launcher** — the inversion of the seed's Cordis `dsh`
 * launcher (TICKET-055).
 *
 * No plugin tree, no DI, no profiles/bundles/patches, no `commander`, no
 * `ctx` — just a plain ESM module that composes the spokes by direct import,
 * prints one line, and returns a code. It wraps the pure {@link main}
 * (cycle 14); it is the ONLY place that reads `process.argv`, prints, and
 * returns an exit code.
 *
 * `launch` never calls `process.exit` — it *returns* the code, and the on-PATH
 * `bin` shim (TICKET-056) assigns it to `process.exitCode`. All output goes
 * through the injectable `stdout`/`stderr` (defaulting to the real process
 * streams) so tests never touch the real streams.
 */

import type { LlmAdapter } from "../llm/index.js";
import {
  ToolRegistry,
  echoTool,
  addTool,
  failTool,
} from "../tools/index.js";
import { main } from "./cli.js";
import type { ProgramResult } from "./program.js";
import type { AgentEvent } from "../agent/index.js";

/** The options a caller may pass to {@link launch}; all optional. */
export interface LauncherOptions {
  /** The argv to parse; defaults to `process.argv.slice(2)`. */
  readonly argv?: readonly string[];
  /** The LLM seam the turn is driven with; defaults to the CLI's fake. */
  readonly adapter?: LlmAdapter;
  /** The tool registry the turn dispatches against; defaults to the built-ins. */
  readonly tools?: ToolRegistry;
  /** When `true`, the turn summary is printed as JSON (see {@link formatResultJson}). */
  readonly json?: boolean;
  /** The stream `--help`/`--version`/result lines are written to. */
  readonly stdout?: { write(chunk: string): unknown };
  /** The stream diagnostics are written to. */
  readonly stderr?: { write(chunk: string): unknown };
  /** The inner-spoke `AgentEvent` trajectory sink, threaded to the turn. */
  readonly onEvent?: (event: AgentEvent) => void;
}

/** The stable `--help` block: a usage line plus the flag list. */
export function helpText(): string {
  return [
    "usage: deepseek <text> [flags]",
    "",
    "flags:",
    "  --session <path>   path of the durable session log",
    "  --id <id>          session id stamped in the log header",
    "  --resume           resume the existing log at --session",
    "  --stream           drive model steps via the streaming seam",
    "  --max-steps <n>    cap the per-turn step budget",
    "  --system <text>    an optional system prompt",
    "  --json             print the turn summary as JSON",
    "  --list             list the registered tools and exit",
    "  --help, -h         show this help",
    "  --version, -v      show the version",
  ].join("\n");
}

/** The stable `--version` line. */
export function versionText(): string {
  return "deepseek-deharness-ts 0.1.0";
}

/**
 * A **pure, deterministic** one-line summary of a settled turn: the `end`
 * reason, `turns`, `steps`, and `logPath` (e.g.
 * `completed turns=1 steps=1 log=<logPath>`).
 */
export function formatResult(result: ProgramResult): string {
  const { end, turns, steps } = result.result;
  return `${end} turns=${turns} steps=${steps} log=${result.logPath}`;
}

/**
 * A **pure, deterministic** JSON summary of a settled turn.
 *
 * The object literal is written with a fixed key order (`end`, `turns`,
 * `steps`, `logPath`) so the serialized string is stable for identical inputs.
 * `end`/`turns`/`steps` come from `result.result`; `logPath` from
 * `result.logPath`.
 */
export function formatResultJson(result: ProgramResult): string {
  const { end, turns, steps } = result.result;
  return JSON.stringify({
    end,
    turns,
    steps,
    logPath: result.logPath,
  });
}

/**
 * A **pure, deterministic** listing of the tools in a registry: one line per
 * tool, in `tools.names()` insertion order, each rendered as
 * `<name> — <description>`, joined by a newline.
 */
export function formatToolList(tools: ToolRegistry): string {
  return tools
    .names()
    .map((name) => {
      const tool = tools.get(name);
      return `${name} — ${tool?.description ?? ""}`;
    })
    .join("\n");
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
 * The process entrypoint. Parse `argv`, and either print help/version (return
 * 0, no turn, no log), list the registered tools (return 0, no turn, no log),
 * or run one turn via {@link main}, print the {@link formatResult} (or
 * {@link formatResultJson}) summary, and return the exit code: `0` when the
 * turn ended `completed` or `max_steps`, else `1`.
 *
 * `--help`/`--version` are intercepted BEFORE `main`; `--list` is intercepted
 * AFTER them and BEFORE `main`. The exit code is driven by `result.end`, not
 * by a throw. No `process.exit` — the code is returned.
 */
export async function launch(opts?: LauncherOptions): Promise<number> {
  const argv = opts?.argv ?? process.argv.slice(2);
  const stdout = opts?.stdout ?? process.stdout;
  const stderr = opts?.stderr ?? process.stderr;

  if (argv.includes("--help") || argv.includes("-h")) {
    stdout.write(helpText() + "\n");
    return 0;
  }
  if (argv.includes("--version") || argv.includes("-v")) {
    stdout.write(versionText() + "\n");
    return 0;
  }
  if (argv.includes("--list")) {
    stdout.write(formatToolList(opts?.tools ?? defaultTools()) + "\n");
    return 0;
  }

  const result = await main(argv, {
    adapter: opts?.adapter,
    tools: opts?.tools,
    onEvent: opts?.onEvent,
  });
  const useJson = opts?.json === true || argv.includes("--json");
  stdout.write((useJson ? formatResultJson(result) : formatResult(result)) + "\n");
  if (result.result.end === "completed" || result.result.end === "max_steps") {
    return 0;
  }
  // `error` / `aborted` — a non-zero exit, driven by the end reason.
  stderr.write(`turn ended: ${result.result.end}\n`);
  return 1;
}
