# TICKET-003: Build the JSONL persistence seam

**Status:** open
**Deliverable:** 3 of 4 (outer spoke)
**Target file:** `src/session/store.ts` (new)

## Title
A minimal persistence seam: serialize/deserialize the `SessionLog` to disk
(JSONL) so the outer spoke survives a reload. Direct module, swappable by
import. No DI, no store service.

## Evidence
The reference's JSONL backend (`packages/session/session-persistence-jsonl/`)
defines the durable on-disk contract:

- `format.ts` `toHeaderLine` / `fromHeaderLine` / `isHeaderLine` — the first
  JSONL record is the immutable `SessionHeader` tagged `type: 'session'`, so a
  reader distinguishes it from an event line.
- `format.ts` `SESSION_FORMAT_VERSION` gate — the header stamps the version; a
  backend rejects any other version on load (no migration while unreleased).
- `format.ts` `SessionLogScanner` / `scanLog` — one event per line; a final
  record without a trailing newline is a **torn write** and is ignored; the
  contiguous committed prefix is preserved.
- `format.ts` `encodeSegment` — a session id is an unvalidated string, so it
  MUST be encoded before use in a path (no traversal, no collision).

## Impact
Without this seam the outer spoke is volatile: a reload loses the whole log.
The torn-tail rule and the version gate are the two correctness properties that
make a crash mid-write safe — if a reader accepts a partial final line, it
reconstructs a corrupt session; if it skips the version gate, an incompatible
log is read silently wrong.

## Suggestion
Create `src/session/store.ts` exporting:
- `serializeLog(log: SessionLog): string` — header line first
  (`JSON.stringify({ type: 'session', ...header })`), then one line per event
  (`JSON.stringify(event)`), each terminated by `\n`.
- `deserializeLog(text: string): { header: SessionHeader; events: SessionEvent[] }`
  — parse line by line; the first line MUST be a well-formed header with
  `version === SESSION_FORMAT_VERSION` (else throw); a final line without a
  trailing newline is a torn write and is ignored; return the committed prefix.
- `writeLog(path: string, log: SessionLog): void` — `serializeLog` to disk
  (create parent dirs; the path is caller-supplied and already safe).
- `readLog(path: string): { header: SessionHeader; events: SessionEvent[] }` —
  read the file, `deserializeLog`.
- `encodeSegment(raw: string): string` — path-segment escaping (injective,
  neutralizes `../`, NUL, separators) so a session id is safe in a path.

Keep it a plain module: functions, no class, no DI. Swappable by import — a
later cycle can drop in a SQLite seam without touching `SessionLog`.
