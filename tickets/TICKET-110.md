# TICKET-110: docs/ARCHITECTURE.md does not document the `Program` public surface (sessionId/logPath/log/turns)

## Title
`docs/ARCHITECTURE.md` describes what `Program` *does* (composes both spokes,
persists the log, resumes) but does not document its *public surface* — the
members a consumer can read. Adding `sessionId` (TICKET-106) is a good moment to
document the full public surface.

## Evidence
`docs/ARCHITECTURE.md`, "The `Program`: composing both spokes" (lines 110-124):
- Describes behavior: builds `AgentOptions`, runs a turn via `runTurn`, owns the
  durable log, persists via `writeLog`, resumes via seed.
- Does NOT list the public members: `logPath` (field), `get log()`,
  `get turns()`, `history()`, `run()`, `resume()` — and (post-TICKET-106)
  `sessionId`.

`src/program/program.ts` public surface (current): `logPath` (103), `get log()`
(125), `get turns()` (130), `run()` (177), `history()` (199), `resume()` (212).

## Impact
Low (documentation). A newcomer reading ARCHITECTURE.md learns the role of
`Program` but must open the source to learn which members are public.

## Suggestion
Add a short "Public surface" bullet list under the `Program` section:
- `sessionId` (readonly; see TICKET-107 for field-vs-getter semantics)
- `logPath` (readonly field)
- `get log(): SessionLog`
- `get turns(): number`
- `run(userText): Promise<ProgramResult>`
- `history(): readonly Message[]`
- `resume(): Promise<Program>`
