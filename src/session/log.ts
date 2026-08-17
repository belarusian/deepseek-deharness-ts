/**
 * The append-only `SessionLog` — the outer spoke of the four algebra.
 *
 * A plain class over an in-memory store. It owns the durable event log for one
 * session and enforces the contiguity contract: `seq = log.length`, so `seq`
 * values are exactly `0..n-1` in order. No DI, no `ctx`, no registration
 * effects, no observer bus — persistence is an explicit call into the seam
 * (TICKET-003), never a hidden side effect.
 *
 * The inversion of the reference's Cordis `Session` service:
 *   `ctx.sessions.create(id, { seed, meta })`  →  `new SessionLog(id, { seed, header })`
 *   `session.append(type, data, intent)`       →  `log.append(type, data, intent)`
 *   `session.events` (frozen snapshot)         →  `log.readAll()`
 *   `session.seq` (= log.length)               →  `log.seq` / `log.last()`
 */

import {
  SESSION_FORMAT_VERSION,
  type SessionEvent,
  type SessionEventMap,
  type SessionEventType,
  type SessionHeader,
} from "./event.js";

/** Optional surface metadata, applied only to surface-eligible event types. */
export interface SurfaceIntent {
  readonly surfaceOp?: "append" | "replace";
  readonly sourceEventSeqs?: readonly number[];
}

/** Options for constructing a {@link SessionLog}. */
export interface SessionLogOptions {
  /** Initial replay/fork history; their `seq` values are preserved. */
  readonly seed?: readonly SessionEvent[];
  /** Storage metadata; stamped from {@link SESSION_FORMAT_VERSION} when absent. */
  readonly header?: SessionHeader;
  /** Injectable clock (Unix epoch ms) for deterministic tests. */
  readonly clock?: () => number;
}

/**
 * A value is *lossless-JSON* when it round-trips through JSON byte-identically:
 * no `undefined` / `function` / `symbol` / `bigint` members, no circular
 * references, and only finite numbers. This is the boundary every event `data`
 * must satisfy before it is logged.
 */
export function isLosslessJson(value: unknown): boolean {
  const seen = new Set<unknown>();
  const walk = (v: unknown): boolean => {
    if (v === null || typeof v === "string" || typeof v === "boolean") return true;
    if (typeof v === "number") return Number.isFinite(v);
    if (typeof v === "bigint") return false;
    if (typeof v === "undefined" || typeof v === "function" || typeof v === "symbol") {
      return false;
    }
    if (Array.isArray(v)) {
      if (seen.has(v)) return false;
      seen.add(v);
      return v.every(walk);
    }
    if (typeof v === "object") {
      if (seen.has(v)) return false;
      seen.add(v);
      return Object.values(v as Record<string, unknown>).every(walk);
    }
    return false;
  };
  return walk(value);
}

/**
 * Deep-snapshot a lossless-JSON value so the log owns a detached copy. Reading
 * `event.data` back returns the logged value, never the caller's still-mutable
 * input. Because the value is lossless-JSON, a JSON round-trip is an exact
 * deep copy.
 */
function detach<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * The append-only session log. One instance per session, composed by the
 * caller. The in-memory store is the single source of truth; `seq` is always
 * `log.length` (the contiguity contract the whole system relies on).
 */
export class SessionLog {
  readonly #events: SessionEvent[] = [];
  readonly #header: SessionHeader;
  readonly #clock: () => number;

  constructor(id: string, opts: SessionLogOptions = {}) {
    this.#header =
      opts.header ??
      ({
        version: SESSION_FORMAT_VERSION,
        id,
        createdAt: Date.now(),
      } satisfies SessionHeader);
    this.#clock = opts.clock ?? Date.now;
    if (opts.seed) {
      for (const event of opts.seed) this.#events.push(event);
    }
  }

  /**
   * Append one durable fact. Assigns `seq = log.length` (contiguous,
   * monotonic) and `time = clock()`, validates `data` is lossless-JSON,
   * detaches it, pushes, and returns the new event.
   *
   * @throws {Error} when `data` is not lossless-JSON.
   */
  append<T extends SessionEventType>(
    type: T,
    data: SessionEventMap[T],
    surfaceIntent?: SurfaceIntent,
  ): SessionEvent<T> {
    if (!isLosslessJson(data)) {
      throw new Error(`SessionLog.append: data for "${type}" is not lossless-JSON`);
    }
    const event = {
      type,
      seq: this.#events.length,
      time: this.#clock(),
      data: detach(data),
      ...(surfaceIntent
        ? {
            ...(surfaceIntent.surfaceOp !== undefined
              ? { surfaceOp: surfaceIntent.surfaceOp }
              : {}),
            ...(surfaceIntent.sourceEventSeqs !== undefined
              ? { sourceEventSeqs: surfaceIntent.sourceEventSeqs }
              : {}),
          }
        : {}),
    } as SessionEvent<T>;
    this.#events.push(event);
    return event;
  }

  /** A frozen snapshot of the whole log, in `seq` order. Never the live array. */
  readAll(): readonly SessionEvent[] {
    return [...this.#events];
  }

  /** The events with `seq >= seq`, in order. `since(0)` is the whole log. */
  since(seq: number): readonly SessionEvent[] {
    return this.#events.filter((e) => e.seq >= seq);
  }

  /** The highest-`seq` event, or `undefined` on an empty log. */
  last(): SessionEvent | undefined {
    return this.#events[this.#events.length - 1];
  }

  /** The contiguity value: `seq` of the next append (`= log.length`). */
  get seq(): number {
    return this.#events.length;
  }

  /** The immutable session header. */
  get header(): SessionHeader {
    return this.#header;
  }
}
