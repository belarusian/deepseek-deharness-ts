# TICKET-024 — gate: build + test + lint green, squash, merge

**Cycle:** 8 (Tools — argument validation)

## Capability
Full gate: `npm run build` + `npm test` + `npm run lint` all green. Squash to a
single commit, push, open PR, merge `--merge --delete-branch`, close issues.

## Acceptance
- Gate GREEN on main.
- No new npm dependencies (dependency-free).
