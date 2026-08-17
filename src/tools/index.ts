/**
 * Public API of the tools module.
 *
 * Re-exported so downstream modules (the agent loop) compose the tool
 * vocabulary, registry, and guarded execution pipeline by direct import. No
 * DI, no registration side effects, no Cordis event seams.
 */

export type {
  JsonSchema,
  Tool,
  ToolResult,
  ToolContext,
} from "./types.js";

export { ToolRegistry, DuplicateToolError } from "./registry.js";

export {
  executeTool,
  toToolDefinition,
  toToolResultBlock,
  type PipelineOptions,
} from "./pipeline.js";
