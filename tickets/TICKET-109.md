# TICKET-109: No test covers a public `Program.sessionId` accessor

## Title
`src/__tests__/program.test.ts` exercises `program.turns` (a dedicated
`describe("Program.turns getter")` block) and `program.log`/`program.logPath`
indirectly, but there is no test for a public `sessionId` accessor — because
none exists yet (TICKET-106).

## Evidence
`src/__tests__/program.test.ts`:
- `describe("Program.turns getter")` block covers `turns` before/after run and
  across `resume()` (cases a-d).
- `describe("on-disk Program ...")` asserts `res.logPath` and reads
  `header.id` from disk via `readLog(logPath)` (e.g. `expect(header.id).toBe("sess-a")`),
  but never reads `program.sessionId` from the object.
- `grep -n "sessionId" src/__tests__/program.test.ts` → only the constructor
  option `sessionId: "sess-*"`; no `program.sessionId` assertion.

## Impact
Low (test coverage). When `sessionId` is added (TICKET-106), there is no test
pinning its semantics, especially the `resume()` behavior flagged in
TICKET-107.

## Suggestion
Add a `describe("Program.sessionId")` block mirroring the `turns` block:
- fresh Program: `program.sessionId` equals the constructed `opts.sessionId`.
- after `run()`: unchanged.
- after `resume()`: equals the on-disk `header.id` (getter form) or the
  original id (field form) — assert whichever semantics TICKET-107 chooses.
