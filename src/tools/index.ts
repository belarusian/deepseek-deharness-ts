/**
 * Public API of the tools module.
 *
 * Re-exported so downstream modules (the agent loop) compose the tool
 * vocabulary, registry, guarded execution pipeline, factory, and built-in
 * tools by direct import. No DI, no registration side effects, no Cordis
 * event seams.
 */

export type {
  JsonSchema,
  Tool,
  ToolResult,
  ToolContext,
} from "./types.js";

export { ToolRegistry, DuplicateToolError } from "./registry.js";

export { validateArgs, type ValidationResult } from "./schema.js";

export {
  executeTool,
  toToolDefinition,
  toToolResultBlock,
  type PipelineOptions,
} from "./pipeline.js";

export { defineTool, type ToolSpec } from "./define.js";

export { echoTool, addTool, failTool } from "./builtins.js";
