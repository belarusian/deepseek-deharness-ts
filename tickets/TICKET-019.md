# TICKET-019 — Vitest coverage (src/__tests__/tools.test.ts)

**Phase:** Tools (cycle 7)
**Target file:** `src/__tests__/tools.test.ts`

## Capability
Vitest coverage for the tools module (Rule 4: every module has a test before
merge).

## Required cases
- **Registry:** add/get/has; duplicate `add` throws; `names()` insertion order;
  `all()` returns the tools; `size` reflects registrations.
- **Pipeline happy path:** `execute` is called, its `ToolResult` is returned.
- **Guard veto:** `guard` returning `false` short-circuits to an `isError`
  result and `execute` is NOT called (assert via a spy).
- **Execute throws:** a throwing `execute` yields an `isError` result (no throw
  escapes `executeTool`).
- **pre/post order:** `pre` runs before `execute`, `post` runs after; both are
  void hooks (assert call order via a spy).
- **Pre-aborted signal:** an already-aborted `opts.signal` yields an `isError`
  result and `execute` is NOT called.

## Notes
- Use `vi.fn()` spies to assert `execute`/`pre`/`post` call counts and order.
- Keep it dependency-free; no new npm deps.
