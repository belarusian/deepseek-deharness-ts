# TICKET-108: Public-surface asymmetry — `logPath` is a field, `sessionId` is not

## Title
The `Program` public surface is asymmetric: of the two required
`ProgramOptions` members (`sessionId`, `logPath`), only `logPath` is exposed as
a public readonly field. `sessionId` is discarded.

## Evidence
`src/program/program.ts`:
- `ProgramOptions` (lines 44-53): `readonly sessionId: string` (46) and
  `readonly logPath: string` (47) are both required.
- Class fields (lines 95-107): `readonly logPath: string` (103) is public;
  there is no `sessionId` field.
- Public getters (lines 125-132): `get log()` and `get turns()`; no
  `get sessionId()`.
- `sessionId` appears only at line 46 (option) and line 119 (consumed by
  `new SessionLog`).

Compare the inner-spoke `Conversation` (`src/agent/conversation.ts`), which
exposes `get turns()` (line 54) and `history()` — a deliberate, documented
public surface. `Program` mirrors that for `turns`/`log` but not for the
session identity.

## Impact
Low (API consistency). The asymmetry is not a bug, but it is an undocumented
gap: a reader of the public surface cannot tell whether `sessionId` is
intentionally private or simply forgotten.

## Suggestion
Resolve via TICKET-106/107 (expose `sessionId`). After the change, the public
surface is symmetric: `sessionId`, `logPath` (fields or getters), `log`,
`turns`.
