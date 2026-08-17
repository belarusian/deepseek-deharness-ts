/**
 * Dependency-free SSE (Server-Sent Events) parser.
 *
 * Reassembles UTF-8 across chunk boundaries, splits events on blank lines,
 * joins multi-`data:` fields, skips comments and non-`data` fields, and yields
 * each event's `data` payload in arrival order. The literal `[DONE]` sentinel
 * is yielded and the generator returns; if the stream ends without it, a
 * {@link LlmFailure} with code `"stream_closed"` is thrown (a truncated
 * response cannot be trusted).
 *
 * @module llm/deepseek/sse
 */

import { LlmFailure } from "../adapter.js";

/** The terminal payload DeepSeek (and OpenAI) send after the last chunk. */
export const DONE = "[DONE]";

/**
 * Parse an async iterable of raw SSE bytes into `data` payloads.
 *
 * @param bytes - raw SSE bytes; reads may split anywhere, including mid-UTF-8.
 * @returns each event's data payload in arrival order, `[DONE]` last.
 */
export async function* parseSse(
  bytes: AsyncIterable<Uint8Array>,
): AsyncGenerator<string> {
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  for await (const chunk of bytes) {
    buffer += decoder.decode(chunk, { stream: true });

    let sep: { start: number; end: number } | null;
    while ((sep = findEventTerminator(buffer)) !== null) {
      const rawEvent = buffer.slice(0, sep.start);
      buffer = buffer.slice(sep.end);

      const data = extractData(rawEvent);
      if (data !== null) {
        yield data;
        if (data === DONE) return;
      }
    }
  }

  // Flush any trailing bytes. An unterminated tail is truncation, not a
  // dispatchable payload (spec-strict: an event dispatches only on its
  // blank-line terminator).
  buffer += decoder.decode();
  throw new LlmFailure("SSE stream ended without [DONE]", "stream_closed");
}

/** Locate the first blank-line event terminator. */
function findEventTerminator(s: string): { start: number; end: number } | null {
  const lf = s.indexOf("\n\n");
  const crlf = s.indexOf("\r\n\r\n");
  if (lf !== -1 && (crlf === -1 || lf < crlf)) return { start: lf, end: lf + 2 };
  if (crlf !== -1) return { start: crlf, end: crlf + 4 };
  return null;
}

/**
 * Extract the `data` payload from a raw event block. Joins multiple `data:`
 * lines with `\n`; skips comments (`:`) and non-`data` fields. Returns `null`
 * when the event carries no `data` field.
 */
function extractData(rawEvent: string): string | null {
  const lines = rawEvent.split(/\r?\n/);
  const parts: string[] = [];

  for (const line of lines) {
    if (line.startsWith(":")) continue; // comment
    if (!line.startsWith("data:")) continue; // event:/id:/retry:/etc.
    let value = line.slice("data:".length);
    if (value.startsWith(" ")) value = value.slice(1);
    parts.push(value);
  }

  if (parts.length === 0) return null;
  return parts.join("\n");
}
