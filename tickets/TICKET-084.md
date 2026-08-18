# TICKET-084 — tag-driven release workflow (CI-verified, dry-run)

**Cycle 20** (Hardening, final). **Type:** CI workflow (new file).

## What
Create `.github/workflows/release.yml` — a tag-driven release workflow that
verifies publishability **without actually publishing**.

## Contents
On `push` with `tags: ['v*']`:
1. checkout
2. setup-node 20 (cache npm)
3. `npm install`
4. `npm run build`
5. `npm test`
6. `npm run lint`
7. `npm publish --dry-run`

The `--dry-run` verifies the package is publishable (metadata valid, `files`
resolvable) without actually publishing — so the release path is
CI-green-verifiable and safe. Do NOT add a real `npm publish` (no npm token in
CI; publishing is a human decision).

## Acceptance
- `.github/workflows/release.yml` exists and is valid YAML.
- It triggers only on `push` tags `v*`.
- The final step is `npm publish --dry-run` (no real publish).
- No code change; all 192 tests pass unchanged.
