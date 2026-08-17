/**
 * The **tool vocabulary** of the deharness program.
 *
 * A `Tool` is a plain object — not a class, not a Cordis plugin, not a DI
 * registration. It carries a model-facing description (name, description,
 * minimal JSON-Schema parameters) and an `execute` body. The registry and the
 * guarded execution pipeline are plain modules that operate on these objects
 * by direct import. No `ctx` key, no registration side effects, no DI
 * container.
 *
 * The LLM seam's `ToolDefinition` / `ToolCallBlock` / `ToolResultBlock`
 * already exist in `src/llm/*`; this module composes them (see
 * {@link toToolDefinition} in `pipeline.ts`) and does not redefine them.
 */

/**
 * A minimal JSON-Schema-shaped parameter description.
 *
 * Structural and deliberately loose: it names the fields the pipeline and the
 * agent loop care about (`type`, `properties`, `required`) and stays open to
 * the rest of the JSON-Schema vocabulary via the index signature. Kept
 * structural (not `Record<string, unknown>`) so a tool's parameter schema is
 * self-describing and checkable, while remaining handable to the provider
 * verbatim. Full validation is a later cycle (8-9); this cycle only carries
 * the shape.
 */
export interface JsonSchema {
  readonly type?: string;
  readonly properties?: Record<string, JsonSchema>;
  readonly required?: readonly string[];
  readonly [key: string]: unknown;
}

/**
 * The completed outcome of one tool call.
 *
 * `content` is the model-facing text (or the rendered error text on failure).
 * `isError` is present and `true` when the call failed. `meta` is an optional,
 * opaque, tool-private payload that does not reach the model.
 */
export interface ToolResult {
  readonly content: string;
  readonly isError?: boolean;
  readonly meta?: unknown;
}

/**
 * An optional, plain context bag threaded through a tool call.
 *
 * `signal` is the caller's cancellation token. The index signature is an open
 * bag for tool-private keys — it is untyped by design. This is NOT a DI
 * container: it is a per-call bag the caller may pass, and a tool reads only
 * the keys it knows about.
 */
export interface ToolContext {
  readonly signal?: AbortSignal;
  readonly [key: string]: unknown;
}

/**
 * A plain tool. `execute` is the only behavior; everything else is data.
 *
 * Structurally, a `Tool` *is* the LLM seam's `ToolDefinition`
 * (`name` / `description` / `parameters`) plus an `execute` body — so the
 * pipeline can project it to the provider vocabulary without redefining it.
 */
export interface Tool {
  /** Stable, unique name (the registry keys on this). */
  readonly name: string;
  /** Model-facing description of what the tool does. */
  readonly description: string;
  /** Minimal JSON-Schema description of the tool's arguments. */
  readonly parameters: JsonSchema;
  /** The tool body. `args` is the parsed argument object; `ctx` is optional. */
  execute(args: unknown, ctx?: ToolContext): Promise<ToolResult>;
}
