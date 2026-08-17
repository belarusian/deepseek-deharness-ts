/**
 * The `SessionEvent` vocabulary — the durable facts of the outer spoke.
 *
 * A `SessionEvent` is a discriminated union over `type`. Each variant carries
 * a stable `seq` (monotonic within the session), a `time` (Unix epoch ms),
 * and a `data` payload whose shape is fixed by the event type. The union is
 * a *proper* mapped type so that `switch (event.type)` narrows `event.data`
 * without casts.
 *
 * No DI, no `ctx`, no registration: these are plain types and a version
 * constant. The log (TICKET-002) and the persistence seam (TICKET-003) build
 * on this vocabulary directly.
 */

/**
 * The on-disk format version, stamped into every header and enforced on load.
 * While unreleased it is pinned at `0`: no compatibility is implied,
 * incompatible logs are rejected, and no migration is provided.
 */
export const SESSION_FORMAT_VERSION = 0;

/**
 * Immutable storage metadata, kept outside the conversation event log.
 */
export interface SessionHeader {
  /** On-disk format version, stamped from {@link SESSION_FORMAT_VERSION}. */
  readonly version: number;
  /** The session's id. */
  readonly id: string;
  /** Non-negative safe-integer Unix epoch milliseconds when created. */
  readonly createdAt: number;
  /** Absolute working directory the session was created in (if any). */
  readonly cwd?: string;
  /** The session this one was forked from (seed lineage), if any. */
  readonly parentSession?: string;
  /** How many leading events were inherited through a seed. */
  readonly seedLength?: number;
  /** Delegation depth: absent (zero) for a top-level session. */
  readonly delegationDepth?: number;
  /** Id of the agent preset this session was composed from, when any. */
  readonly agentPreset?: string;
}

// ── Minimal JSON-serializable message payloads ─────────────────────────────
// The reference pulls these from `@deepseek-ai/dsh-llm`; this repo has no such
// dependency, so we define local minimal shapes that round-trip through JSON.

/** A user-role message on the model-visible surface. */
export interface UserMessage {
  readonly role: "user";
  readonly content: string;
}

/** An assistant-role message for one step. */
export interface AssistantMessage {
  readonly role: "assistant";
  readonly content: string;
}

/** A completed tool call's model-facing result. */
export interface ToolResultMessage {
  readonly role: "tool";
  readonly callId: string;
  readonly content: string;
}

/** Token accounting reported by the adapter, when any. */
export interface TokenUsage {
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
}

// ── The event vocabulary ────────────────────────────────────────────────────

/**
 * The per-type `data` payloads. The core vocabulary this cycle needs; the
 * union is merge-extensible by design (later cycles add `todo/write`,
 * `request/header`, etc. without touching the envelope).
 */
export interface SessionEventMap {
  /** Opens turn `turn` before the loop runs. */
  "turn/start": { readonly turn: number };
  /** Closes turn `turn` with the reason that ended it. */
  "turn/end": { readonly turn: number; readonly reason: string };
  /** Opens step `step` of turn `turn` — one model call plus tool executions. */
  "step/start": { readonly turn: number; readonly step: number };
  /** Closes step `step` of turn `turn`. */
  "step/end": { readonly turn: number; readonly step: number };
  /** A user-role message on the model-visible surface. */
  "user/message": UserMessage;
  /** Assembled assistant message for one step, with optional usage. */
  "assistant/message": {
    readonly turn: number;
    readonly step: number;
    readonly message: AssistantMessage;
    readonly usage?: TokenUsage;
  };
  /** The model requested one tool invocation. */
  "tool/call": {
    readonly turn: number;
    readonly step: number;
    readonly callId: string;
    readonly name: string;
    readonly arguments: string;
  };
  /** A completed tool call's model-facing result. */
  "tool/result": {
    readonly turn: number;
    readonly step: number;
    readonly message: ToolResultMessage;
    readonly error?: { readonly name: string; readonly code: string };
    readonly meta?: unknown;
  };
}

/** The appendable event-type keys of {@link SessionEventMap}. */
export type SessionEventType = keyof SessionEventMap;

/** The subset of event types that produce LLM messages. */
export type SurfaceEventType =
  | "user/message"
  | "assistant/message"
  | "tool/result";

/**
 * The `SessionEvent` envelope: a proper mapped discriminated union over
 * `type`, so `switch (event.type)` narrows `event.data` without casts.
 *
 * - `seq` — monotonic sequence number within the session (`seq = log.length`).
 * - `time` — Unix epoch milliseconds.
 * - `data` — the per-type payload.
 * - `ignorable?` — marks an event a reader may safely skip when it does not
 *   recognize `type`. Absent means *required*: a reader meeting an
 *   unrecognized type without the marker MUST refuse to reconstruct.
 * - `surfaceOp` / `sourceEventSeqs` — conditional, present only on
 *   {@link SurfaceEventType} variants.
 */
export type SessionEvent<T extends SessionEventType = SessionEventType> = {
  [K in T]: {
    readonly type: K;
    readonly seq: number;
    readonly time: number;
    readonly data: SessionEventMap[K];
    readonly ignorable?: true;
  } & (K extends SurfaceEventType
    ? {
        readonly surfaceOp?: "append" | "replace";
        readonly sourceEventSeqs?: readonly number[];
      }
    : {
        readonly surfaceOp?: never;
        readonly sourceEventSeqs?: never;
      });
}[T];
