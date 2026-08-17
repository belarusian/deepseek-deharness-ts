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
export interface Program {
  readonly name: string;
}

export const program: Program = { name };

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
