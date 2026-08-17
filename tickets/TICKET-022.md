# TICKET-022 — barrel re-exports for the new tools public API

**Cycle:** 8 (Tools — argument validation)
**Files:** `src/tools/index.ts`, `src/index.ts`

## Capability
- `src/tools/index.ts`: re-export `validateArgs`, `ValidationResult` (and any
  `SchemaError` introduced) from `./schema.js`.
- `src/index.ts`: re-export the new tools public API from `./tools/index.js`.

## Acceptance
- `import { validateArgs } from "deepseek-deharness-ts"` (top-level) resolves.
- `ValidationResult` type is reachable from both barrels.
