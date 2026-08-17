/**
 * **Concrete, dependency-free built-in tools.**
 *
 * Three `Tool`s, each assembled via {@link defineTool} (not a hand-written
 * literal): `echoTool`, `addTool`, and `failTool`. They are dependency-free
 * and deterministic — no network, no filesystem, no `Date.now()` — so they
 * double as the canonical fixtures for the guarded execution pipeline.
 *
 * - `echoTool` returns its `args` as JSON in `content` (open object schema).
 * - `addTool` sums two required numbers and returns the sum as a string.
 * - `failTool` always throws, exercising the pipeline's failure path (the
 *   pipeline turns the throw into an `isError` result and skips `post`).
 *
 * Composes the tools `Tool` type and the `defineTool` factory; does not
 * redefine the LLM seam's `ToolDefinition` / `ToolCallBlock` /
 * `ToolResultBlock`.
 */

import { defineTool } from "./define.js";
import type { Tool } from "./types.js";

/**
 * `echoTool` — returns its `args` as a JSON string in `content`.
 *
 * Schema is an open object (no `required`, no `additionalProperties: false`),
 * so any JSON object passes validation.
 */
export const echoTool: Tool = defineTool({
  name: "echo",
  description: "Echo back the given arguments as a JSON string.",
  parameters: { type: "object" },
  execute: async (args) => ({ content: JSON.stringify(args) }),
});

/**
 * `addTool` — sums two required numbers `a` and `b`, returning the sum as a
 * string. Arithmetic is exact for the deterministic test inputs.
 */
export const addTool: Tool = defineTool({
  name: "add",
  description: "Add two numbers and return the sum as a string.",
  parameters: {
    type: "object",
    properties: {
      a: { type: "number" },
      b: { type: "number" },
    },
    required: ["a", "b"],
  },
  execute: async (args) => {
    const { a, b } = args as { a: number; b: number };
    return { content: String(a + b) };
  },
});

/**
 * `failTool` — always throws.
 *
 * Throwing (rather than returning an `isError` result) is deliberate: it
 * exercises the pipeline's failure path, where the pipeline catches the throw,
 * returns an `isError` result, and skips the `post` hook.
 */
export const failTool: Tool = defineTool({
  name: "fail",
  description: "Always fail; used to exercise the pipeline's failure path.",
  parameters: { type: "object" },
  execute: async () => {
    throw new Error("failTool always fails");
  },
});
