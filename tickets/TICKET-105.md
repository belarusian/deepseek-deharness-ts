# TICKET-105: Verify README `new Program(opts)` bullet notes `turns` is a public getter

**Cycle:** 27
**Module:** `README.md`
**Type:** documentation (verify + possibly one clause)

## Problem
The `new Program(opts)` bullet (updated in cycle 26) says "`turns` is
cumulative" but does not state that the count is observable as a public getter.

## Fix
Verify the bullet remains accurate. If it does not mention that the count is
observable, add a short clause that `turns` is a public getter. No flag row —
no new flag is introduced this cycle.
