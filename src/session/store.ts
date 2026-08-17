/**
 * The JSONL persistence seam — serialize/deserialize the `SessionLog` to disk
 * so the outer spoke survives a reload.
 *
 * A plain module of functions (no class, no DI, no store service). Swappable
 * by import: a later cycle can drop in a SQLite seam without touching
 * `SessionLog`.
 *
 * On-disk contract (preserved from the reference's JSONL backend):
 * - **Header line first.** The first JSONL record is the immutable
 *   `SessionHeader` tagged `type: 'session'`, so a reader distinguishes it
 *   from an event line.
 * - **One event per line.** Each subsequent line is one `SessionEvent`
 *   verbatim, terminated by `\n`.
 * - **Version gate.** The header stamps `SESSION_FORMAT_VERSION`; a reader
 *   rejects any other version on load (no migration while unreleased).
 * - **Torn-tail recovery.** A final record without a trailing newline is a
 *   torn write and is ignored; the contiguous committed prefix is preserved.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  SESSION_FORMAT_VERSION,
  type SessionEvent,
  type SessionHeader,
} from "./event.js";
import type { SessionLog } from "./log.js";

/** The first JSONL record: the immutable header tagged `type: 'session'`. */
export interface HeaderLine extends SessionHeader {
  readonly type: "session";
}

/** The result of deserializing a JSONL log. */
export interface DeserializedLog {
  readonly header: SessionHeader;
  readonly events: SessionEvent[];
}

/**
 * Build the header line object from a {@link SessionHeader}.
 */
function toHeaderLine(header: SessionHeader): HeaderLine {
  return { type: "session", ...header };
}

/** Type guard: a parsed first line is a well-formed session header. */
function isHeaderLine(value: unknown): value is HeaderLine {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    v.type === "session" &&
    typeof v.version === "number" &&
    typeof v.id === "string" &&
    typeof v.createdAt === "number" &&
    Number.isSafeInteger(v.createdAt) &&
    v.createdAt >= 0
  );
}

/**
 * Serialize a {@link SessionLog} to JSONL: the header line first, then one
 * line per event, each terminated by `\n`.
 */
export function serializeLog(log: SessionLog): string {
  const lines: string[] = [JSON.stringify(toHeaderLine(log.header))];
  for (const event of log.readAll()) {
    lines.push(JSON.stringify(event));
  }
  return lines.map((l) => l + "\n").join("");
}

/**
 * Deserialize a JSONL log back into a header + events.
 *
 * - The first line MUST be a well-formed header with
 *   `version === SESSION_FORMAT_VERSION` (else throw).
 * - A final line without a trailing newline is a torn write and is ignored.
 * - Returns the contiguous committed prefix.
 *
 * @throws {Error} on a malformed/missing header or a version mismatch.
 */
export function deserializeLog(text: string): DeserializedLog {
  // Split into lines, tracking which lines are newline-terminated. A final
  // line without a trailing `\n` is a torn write and is dropped.
  const terminated: string[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === "" && i === lines.length - 1) continue; // trailing newline
    // A line is committed iff it is followed by a newline (i < len-1) or the
    // text ends with a newline. The last element after split is "" only when
    // the text ends with "\n"; otherwise the last element is a torn line.
    const isLast = i === lines.length - 1;
    if (isLast && !text.endsWith("\n")) continue; // torn tail
    if (line === "") continue;
    terminated.push(line);
  }

  if (terminated.length === 0) {
    throw new Error("deserializeLog: empty log (no header line)");
  }

  const headerLine = JSON.parse(terminated[0]) as unknown;
  if (!isHeaderLine(headerLine)) {
    throw new Error("deserializeLog: first line is not a well-formed session header");
  }
  if (headerLine.version !== SESSION_FORMAT_VERSION) {
    throw new Error(
      `deserializeLog: unsupported format version ${headerLine.version} (expected ${SESSION_FORMAT_VERSION})`,
    );
  }
  const { type: _tag, ...header } = headerLine;

  const events: SessionEvent[] = [];
  for (let i = 1; i < terminated.length; i++) {
    events.push(JSON.parse(terminated[i]) as SessionEvent);
  }
  return { header, events };
}

/**
 * Write a {@link SessionLog} to disk as JSONL (creating parent directories).
 * The path is caller-supplied and already safe.
 */
export function writeLog(path: string, log: SessionLog): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, serializeLog(log), "utf8");
}

/**
 * Read a JSONL log from disk.
 */
export function readLog(path: string): DeserializedLog {
  return deserializeLog(readFileSync(path, "utf8"));
}

/**
 * Encode an arbitrary string as a single safe path segment, injectively over
 * all JS (UTF-16) strings. A session id is an unvalidated string, so this
 * neutralizes `../`, absolute paths, NUL, and separators before any
 * filesystem use. Safe code units remain literal; every other unit becomes
 * `~XXXX`.
 *
 * @throws {Error} on an empty string.
 */
export function encodeSegment(raw: string): string {
  if (raw.length === 0) throw new Error("cannot encode an empty path segment");
  if (raw === ".") return "~002E";
  if (raw === "..") return "~002E~002E";
  let out = "";
  for (let i = 0; i < raw.length; i++) {
    const code = raw.charCodeAt(i);
    const ch = String.fromCharCode(code);
    if (ch !== "~" && /^[A-Za-z0-9._-]$/.test(ch)) {
      out += ch;
    } else {
      out += "~" + code.toString(16).toUpperCase().padStart(4, "0");
    }
  }
  return out;
}
