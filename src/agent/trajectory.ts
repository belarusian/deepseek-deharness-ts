/**
 * The **trajectory fold** — the bridge from the agent loop's `AgentEvent`
 * vocabulary (the inner spoke) to the session log's `SessionEvent` vocabulary
 * (the outer spoke).
 *
 * `toSessionEvent` is a **pure, total** mapping over the six `AgentEvent`
 * variants. It is a *payload transformation*, not a plain rename: the
 * `AgentEvent` payloads are the LLM seam's types (`AssistantMessage`,
 * `ToolCallBlock`, `ToolResultBlock`), while the `SessionEventMap` payloads are
 * the session's own minimal JSON types. The transformations are:
 *
 * 1. `assistant` → `assistant/message`: **lossy** flattening. The LLM
 *    `AssistantMessage.blocks[]` is reduced to a single `content: string` by
 *    concatenating the `text` blocks in order. `tool_call` blocks are
 *    intentionally omitted here (they are recorded as separate `tool/call`
 *    events), and `finishReason` is dropped (the session `AssistantMessage` has
 *    no field for it). A tool-call-only assistant message flattens to `""`.
 * 2. `tool_call` → `tool/call`: field rename `id → callId`; `type` dropped.
 * 3. `tool_result` → `tool/result`: `toolCallId → callId`, wrapped in
 *    `message: { role: "tool", callId, content }`; `isError?` maps to the
 *    `error?` sibling as `{ name: "tool_error", code: "tool_error" }` when the
 *    tool call failed, and is **absent** (not `undefined`) otherwise so the
 *    payload stays lossless-JSON.
 *
 * The envelope fields `seq` and `time` are **not** assigned here — they are the
 * `SessionLog`'s job (it stamps `seq = log.length` and `time = clock()` in
 * `append`). `toSessionEvent` returns only the `append` inputs: a
 * `{ type, data }` pair, or `null` for a variant it does not map (none of the
 * six do, so the `null` arm is defensive and unreachable for a well-formed
 * `AgentEvent`).
 *
 * Two `SessionEventMap` variants are deliberately **not** produced by this
 * fold: `user/message` (the user text is appended to the transcript by
 * `runTurn` but is never emitted as an `AgentEvent`) and `step/end` (there is
 * no `step_end` `AgentEvent`). Those are the sink's concern, not the fold's.
 * Likewise `assistant/message`'s optional `usage?` is never populated: the LLM
 * seam's `AssistantMessage` carries no usage, so the field is left absent.
 */

import type { SessionEventMap } from "../session/event.js";
import type { ContentBlock, TextBlock } from "../llm/index.js";
import type { AgentEvent } from "./types.js";

/**
 * The `append`-input shape `toSessionEvent` produces: a `{ type, data }` pair
 * whose `data` is the per-type payload from {@link SessionEventMap}. This is a
 * proper discriminated union over the six session event types the fold can
 * emit, so `switch (fold.type)` narrows `fold.data` without casts.
 */
export type SessionEventFold = {
  [K in
    | "turn/start"
    | "turn/end"
    | "step/start"
    | "assistant/message"
    | "tool/call"
    | "tool/result"]: {
    readonly type: K;
    readonly data: SessionEventMap[K];
  };
}[
  | "turn/start"
  | "turn/end"
  | "step/start"
  | "assistant/message"
  | "tool/call"
  | "tool/result"
];

/**
 * Concatenate the `text` blocks of an assistant message, in order, into a
 * single string. `tool_call` and `tool_result` blocks are ignored (a
 * tool-call-only message flattens to `""`).
 */
function flattenText(blocks: readonly ContentBlock[]): string {
  return blocks
    .filter((b): b is TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

/**
 * Fold one `AgentEvent` into the `SessionLog.append` inputs, or `null` if the
 * variant is not mapped. Pure and total: no side effects, no `seq`/`time`.
 */
export function toSessionEvent(
  event: AgentEvent,
): SessionEventFold | null {
  switch (event.type) {
    case "turn_start":
      return {
        type: "turn/start",
        data: { turn: event.turn },
      };
    case "step_start":
      return {
        type: "step/start",
        data: { turn: event.turn, step: event.step },
      };
    case "assistant":
      return {
        type: "assistant/message",
        data: {
          turn: event.turn,
          step: event.step,
          message: {
            role: "assistant",
            content: flattenText(event.message.blocks),
          },
        },
      };
    case "tool_call":
      return {
        type: "tool/call",
        data: {
          turn: event.turn,
          step: event.step,
          callId: event.call.id,
          name: event.call.name,
          arguments: event.call.arguments,
        },
      };
    case "tool_result":
      return {
        type: "tool/result",
        data: {
          turn: event.turn,
          step: event.step,
          message: {
            role: "tool",
            callId: event.result.toolCallId,
            content: event.result.content,
          },
          ...(event.result.isError
            ? { error: { name: "tool_error", code: "tool_error" } }
            : {}),
        },
      };
    case "turn_end":
      return {
        type: "turn/end",
        data: { turn: event.turn, reason: event.reason },
      };
  }
}
