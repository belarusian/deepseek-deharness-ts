/**
 * deepseek-deharness-ts
 *
 * The inversion of deepseek-harness + cordis. Everything is a Program, not a
 * plugin: the agent loop, tools, session log, and llm-adapter are on-disk
 * TypeScript modules with clean APIs that compose directly. No Cordis plugin
 * tree, no DI container, no profiles/bundles/patches — program composition
 * (disk + PATH + clean APIs) instead of meta-composition.
 *
 * Organized by the four algebra: the inner spoke is work + trajectory, the
 * outer spoke is the append-only log.
 */

export const name = "deepseek-deharness-ts";

/**
 * A minimal, dependency-free marker of the program-composition contract.
 * Real modules (agent loop, tools, session, llm-adapter) are composed here
 * directly — imported, not registered.
 */
export interface ProgramMarker {
  readonly name: string;
}

export const program: ProgramMarker = { name };

// ── Session (the outer spoke) ───────────────────────────────────────────────
// Re-exported so downstream modules (llm-adapter, tools, agent loop) compose
// the session API by direct import, not by reaching into `src/session/*`.

export {
  SESSION_FORMAT_VERSION,
  type SessionEvent,
  type SessionEventMap,
  type SessionEventType,
  type SurfaceEventType,
  type SessionHeader,
  type UserMessage,
  type AssistantMessage,
  type ToolResultMessage,
  type TokenUsage,
} from "./session/event.js";

export {
  SessionLog,
  isLosslessJson,
  type SessionLogOptions,
  type SurfaceIntent,
} from "./session/log.js";

export {
  serializeLog,
  deserializeLog,
  writeLog,
  readLog,
  encodeSegment,
  type HeaderLine,
  type DeserializedLog,
} from "./session/store.js";

// ── LLM seam (the provider-neutral message/stream/adapter vocabulary) ──────
// Re-exported so downstream modules (session, agent loop) compose the LLM
// vocabulary by direct import. `AssistantMessage` is intentionally NOT
// re-exported here: the session module already exports a same-named (but
// distinct) `AssistantMessage`, and the LLM one is available via
// `import { AssistantMessage } from "./llm/index.js"`.

export {
  textBlock,
  toolCallBlock,
  toolResultBlock,
  message,
  assistantMessage,
  type Role,
  type TextBlock,
  type ToolCallBlock,
  type ToolResultBlock,
  type ContentBlock,
  type Message,
} from "./llm/index.js";

export {
  textDelta,
  toolCallDelta,
  usageInfo,
  finishChunk,
  streamEnd,
  makeLlmStream,
  assembleAssistant,
  type TextDelta,
  type ToolCallDelta,
  type UsageInfo,
  type FinishChunk,
  type StreamChunk,
  type StreamUsage,
  type StreamEnd,
  type LlmStream,
} from "./llm/index.js";

export {
  LlmFailure,
  type ToolDefinition,
  type CallOptions,
  type LlmAdapter,
} from "./llm/index.js";

export {
  FakeLlmAdapter,
  type ScriptedResponse,
} from "./llm/index.js";

export {
  withRetry,
  type RetryOptions,
} from "./llm/index.js";

// ── DeepSeek wire adapter (the concrete HTTP seam) ──────────────────────────
// Re-exported so downstream modules (agent loop) compose the DeepSeek adapter
// by direct import. The wire types, serializer, SSE parser, translator, and
// adapter are all plain modules — no DI, no registration.

export {
  serializeMessages,
  serializeRequest,
  parseSse,
  translate,
  DeepSeekLlmAdapter,
  DONE,
  type WireMessage,
  type WireToolCall,
  type WireTool,
  type WireRequest,
  type WireChunk,
  type WireChoice,
  type WireDelta,
  type WireToolCallDelta,
  type WireUsage,
  type WireError,
  type DeepSeekAdapterConfig,
} from "./llm/deepseek/index.js";

// ── Tools (registry + guarded execution pipeline) ──────────────────────────
// Re-exported so the agent loop (cycles 10-13) composes the tool vocabulary,
// registry, and pipeline by direct import. Plain modules — no DI, no
// registration side effects, no Cordis event seams. The LLM seam's
// `ToolDefinition` (above) is the model-facing projection a `Tool` composes;
// the tools `Tool` is a distinct name and does not collide with it.

export {
  ToolRegistry,
  DuplicateToolError,
  executeTool,
  toToolDefinition,
  toToolResultBlock,
  validateArgs,
  type ValidationResult,
  type JsonSchema,
  type Tool,
  type ToolResult,
  type ToolContext,
  type PipelineOptions,
} from "./tools/index.js";

export {
  defineTool,
  type ToolSpec,
  echoTool,
  addTool,
  failTool,
} from "./tools/index.js";

// ── Agent loop (the inner spoke: work + trajectory) ────────────────────────
// Re-exported so downstream modules compose the loop and its vocabulary by
// direct import. `AssistantMessage` is intentionally NOT re-exported here: the
// session module already exports a same-named (but distinct) `AssistantMessage`,
// and the LLM one is available via `import { AssistantMessage } from
// "./llm/index.js"`.

export {
  runAgent,
  Conversation,
  toSessionEvent,
  type AgentOptions,
  type AgentEvent,
  type TurnEndReason,
  type AgentResult,
} from "./agent/index.js";

// ── On-disk Program (the four-algebra composition) ─────────────────────────
// Re-exported so downstream modules compose the Program, the CLI entrypoint,
// and their option/result types by direct import. The inline `Program` marker
// above is `ProgramMarker` (type-only) so the `Program` class re-export below
// owns the name.

export {
  Program,
  main,
  launch,
  helpText,
  versionText,
  formatResult,
  type ProgramOptions,
  type ProgramResult,
  type CliOptions,
  type LauncherOptions,
} from "./program/index.js";
