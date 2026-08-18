# TICKET-106: Expose `Program.sessionId` as a public readonly field on the on-disk Program

## Title
`ProgramOptions.sessionId` is a required member, but the `Program` class
discards it after constructing the `SessionLog`. There is no `#sessionId`
field and no public `sessionId` accessor, while `logPath` is already a public
readonly field and `get log()` / `get turns()` are public getters. Expose the
session identity as a public readonly member for parity.

## Evidence
`src/program/program.ts`:
- line 46: `readonly sessionId: string;` — required member of `ProgramOptions`.
- line 47: `readonly logPath: string;` — required member of `ProgramOptions`.
- line 103: `readonly logPath: string;` — **public readonly field** on the class.
- line 118: `this.logPath = opts.logPath;` — `logPath` is retained.
- line 119: `this.#log = new SessionLog(opts.sessionId, { clock: this.#clock });`
  — `opts.sessionId` is consumed here and **never stored again**.
- lines 95-107: the private field block (`#adapter`, `#tools`, `#system`,
  `#maxSteps`, `#stream`, `#clock`, `#callOptions`, `#onEvent`) plus the public
  `logPath` (103) and `#log` (104) — **no `#sessionId` field**.
- lines 125-132: `get log(): SessionLog` and `get turns(): number` — public
  getters; **no `get sessionId`** accessor.
- `grep -n "sessionId" src/program/program.ts` → only lines 46 and 119.

The session identity IS recoverable today only by reaching into
`program.log.header.id` (`src/session/log.ts` `get header()`), which is an
indirection the public surface does not advertise.

## Impact
Low (API completeness / ergonomics). A consumer that holds a `Program` cannot
read the session id without the `program.log.header.id` indirection, even though
`logPath` (the other required option) is a first-class public field. This is an
asymmetry in the public surface: two required options (`sessionId`, `logPath`),
only one is exposed.

## Suggestion
Add a public readonly `sessionId` member to `Program`. See TICKET-107 for the
field-vs-getter decision (the `resume()` path can change the log's id). The
minimal change, consistent with the existing `logPath` field: