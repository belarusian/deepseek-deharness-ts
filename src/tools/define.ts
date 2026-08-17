/**
 * The **tool factory** for the tools module.
 *
 * `defineTool` is the single, plain place a `Tool` literal is assembled by
 * callers, so the shape stays consistent. It is a *factory*, not a registry:
 * it returns a `Tool`; it does not register, observe, or mutate any global.
 * `ToolRegistry` is the only place tools are stored.
 *
 * No class, no DI, no registration side effects. Composes the tools `Tool`
 * type; does not redefine the LLM seam's `ToolDefinition` / `ToolCallBlock` /
 * `ToolResultBlock`.
 */

import type { JsonSchema, Tool, ToolContext, ToolResult } from "./types.js";

/**
 * The spec a caller hands to {@link defineTool}.
 *
 * `execute` is the only behavior; `name` / `description` / `parameters` are
 * the model-facing data. `ctx` is the optional per-call context bag.
 */
export interface ToolSpec {
  readonly name: string;
  readonly description: string;
  readonly parameters: JsonSchema;
  readonly execute: (args: unknown, ctx?: ToolContext) => Promise<ToolResult>;
}

/**
 * Assemble a `Tool` from a {@link ToolSpec}.
 *
 * A pure factory: returns a new `Tool` object. It does not register the tool
 * anywhere, observe it, or mutate any global — `ToolRegistry` is the only
 * place tools are stored.
 */
export function defineTool(spec: ToolSpec): Tool {
  return {
    name: spec.name,
    description: spec.description,
    parameters: spec.parameters,
    execute: spec.execute,
  };
}
