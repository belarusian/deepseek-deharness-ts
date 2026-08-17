# TICKET-074 — (conditional) smallest additive fix if the E2E exposes a gap

**Module:** `src/program/*` (only if a gap is found)

## Capability
If the E2E tests (TICKET-070..073) expose a real gap — a flag not threaded, a
log not written, a wrong exit code, a non-contiguous `seq` on resume — close it
with the **smallest additive** fix.

## Behavior
- No behavior change to the happy path; all 182 existing tests must keep
  passing.
- The fix is additive (optional fields / a missing write / a corrected code
  path), not a refactor.

## Constraints
- Only opened if the E2E fails for a real reason (not a test bug).
- Re-verify the full gate (build + test + lint) after the fix.
