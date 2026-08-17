# TICKET-029 — gate: build + test + lint green, squash, merge

**Cycle:** 9 (Tools — factory + built-ins)

## Capability
Full gate: `npm run build` + `npm test` + `npm run lint` all green. Squash to a
single commit, push, open PR, merge `--merge --delete-branch`, close issues.

## Acceptance
- Gate GREEN on main.
- No new npm dependencies (dependency-free).
- Every new module (define.ts, builtins.ts) has a vitest test before merge.
