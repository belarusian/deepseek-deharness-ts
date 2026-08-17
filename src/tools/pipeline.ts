/**
 * The **guarded execution pipeline** for a single tool call.
 *
 * `executeTool` runs a fixed, plain shape:
 *
 *   pre -> guard -> validate -> execute -> post -> result
 *
 * - `pre` (optional) is a **void side-effect hook**; its return value is
 *   ignored.
 * - `guard` (optional) returns a boolean; `false` short-circuits to an
 *   `isError` result WITHOUT calling `tool.execute`. This is the load-bearing
 *   hook: it lets a caller (the agent loop, cycles 10-13) veto a tool call —
 *   approval, rate-limit, capability check — before the body runs.
 * - `validate` (default `true`) checks `args` against `tool.parameters`
 *   with {@link validateArgs}; a schema failure short-circuits to an
 *   `isError` result WITHOUT calling `tool.execute` (or `post`). Set
 *   `validate: false` to skip the stage entirely.
 * - A pre-aborted `opts.signal` returns an `isError` result WITHOUT calling
 *   `tool.execute`.
 * - A throwing `tool.execute` is caught and turned into an `isError` result;
 *   a tool body never crashes the caller.
 * - `post` (optional) is a **void side-effect hook**; its return value is
 *   ignored.
 * - `result` is the terminal stage: the settled `ToolResult` is returned.
 *
 * The LLM seam's `ToolDefinition` / `ToolResultBlock` are composed here (not
 * redefined): {@link toToolDefinition} projects a `Tool` into the provider
 * vocabulary, and {@link toToolResultBlock} projects a `ToolResult` into the
 * model-facing result block.
 */

import type { ToolDefinition, ToolResultBlock } from "../llm/index.js";
import { toolResultBlock } from "../llm/index.js";
import type { Tool, ToolResult } from "./types.js";
import { validateArgs } from "./schema.js";

/** Optional per-call hooks for {@link executeTool}. */
export interface PipelineOptions {
  /**
   * Runs first. A void side-effect hook: its return value is ignored. Use it
   * for logging, metrics, or pre-dispatch bookkeeping.
   */
  pre?(tool: Tool, args: unknown): void | Promise<void>;
  /**
   * Runs after `pre`. Returning `false` short-circuits to an `isError` result
   * WITHOUT calling `tool.execute`. Returning `true` (or a truthy value)
   * continues.
   */
  guard?(tool: Tool, args: unknown): boolean | Promise<boolean>;
  /**
   * Whether to validate `args` against `tool.parameters` before `execute`
   * (default `true`). A schema failure short-circuits to an `isError`
   * result WITHOUT calling `tool.execute` or `post`. Set `false` to skip
   * the stage entirely (execute runs regardless of schema).
   */
  validate?: boolean;
  /**
   * Runs after `execute` settles (success or caught failure). A void
   * side-effect hook: its return value is ignored.
   */
  post?(
    tool: Tool,
    args: unknown,
    result: ToolResult,
  ): void | Promise<void>;
  /** The caller's cancellation token, checked before dispatch. */
  signal?: AbortSignal;
}

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
 * Run one tool call through the guarded pipeline and return its `ToolResult`.
 * Never throws for a throwing `execute`; failures are returned as `isError`.
 */
export async function executeTool(
  tool: Tool,
  args: unknown,
  opts?: PipelineOptions,
): Promise<ToolResult> {
  // ── pre (void side-effect hook) ──────────────────────────────────────────
  if (opts?.pre) {
    await opts.pre(tool, args);
  }

  // ── guard (veto before the body runs) ────────────────────────────────────
  if (opts?.guard) {
    const allowed = await opts.guard(tool, args);
    if (!allowed) {
      return {
        content: `tool "${tool.name}" blocked by guard`,
        isError: true,
      };
    }
  }

  // ── pre-aborted signal (checked before dispatch) ─────────────────────────
  if (opts?.signal?.aborted) {
    return {
      content: `tool "${tool.name}" aborted before execution`,
      isError: true,
    };
  }

  // ── validate (schema conformance before the body runs) ─────────────────
  if (opts?.validate !== false) {
    const verdict = validateArgs(tool.parameters, args);
    if (!verdict.ok) {
      return {
        content: `tool "${tool.name}" invalid arguments: ${verdict.errors.join(", ")}`,
        isError: true,
      };
    }
  }

  // ── execute (a throwing body is contained into an isError result) ────────
  let result: ToolResult;
  try {
    result = await tool.execute(args);
  } catch (err) {
    return {
      content: `tool "${tool.name}" failed: ${errorMessage(err)}`,
      isError: true,
    };
  }

  // ── post (void side-effect hook) ─────────────────────────────────────────
  if (opts?.post) {
    await opts.post(tool, args, result);
  }

  // ── result (terminal) ────────────────────────────────────────────────────
  return result;
}

/**
 * Project a `Tool` into the LLM seam's `ToolDefinition` (the provider-facing
 * vocabulary). Composes, does not redefine, `src/llm/adapter.ts`.
 */
export function toToolDefinition(tool: Tool): ToolDefinition {
  return {
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  };
}

/**
 * Project a `ToolResult` into the LLM seam's `ToolResultBlock` (the
 * model-facing result block). `meta` is tool-private and intentionally not
 * carried into the block. Composes, does not redefine, `src/llm/message.ts`.
 */
export function toToolResultBlock(
  toolCallId: string,
  result: ToolResult,
): ToolResultBlock {
  return toolResultBlock(toolCallId, result.content, result.isError);
}
