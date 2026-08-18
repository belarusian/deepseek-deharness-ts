# TICKET-107: `Program.sessionId` — field vs getter: `resume()` can change the log's id

## Title
When adding the public `sessionId` member (TICKET-106), decide whether it is a
plain field (snapshot of `opts.sessionId`) or a getter (tracks the current
log). `resume()` rebuilds the log from the on-disk header's id, so the two can
diverge.

## Evidence
`src/program/program.ts`:
- line 119 (constructor): `this.#log = new SessionLog(opts.sessionId, ...)` —
  the initial log's id is `opts.sessionId`.
- line 213: `const { header, events } = readLog(this.logPath);`
- line 214: `this.#log = new SessionLog(header.id, { seed: events, header, ... })`
  — after `resume()`, the log's id is `header.id` **read from disk**, which is
  not guaranteed to equal the original `opts.sessionId`.

`src/session/log.ts`: `get header(): SessionHeader` exposes `header.id`.

So:
- A **field** `readonly sessionId = opts.sessionId` would report the *original*
  id even after `resume()` swapped in a log with a different `header.id`.
- A **getter** `get sessionId() { return this.#log.header.id; }` would report
  the *current* log's id, staying consistent with `program.log.header.id`.

## Impact
Low (correctness of the new accessor). If a field is chosen and a caller resumes
a log whose on-disk id differs from the constructed id, `program.sessionId`
would disagree with `program.log.header.id` — a confusing invariant break.

## Suggestion
Prefer the **getter** form so `sessionId` is always consistent with the log it
describes: