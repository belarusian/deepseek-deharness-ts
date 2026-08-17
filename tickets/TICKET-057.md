# TICKET-057 — package.json bin field + barrel re-exports

**Modules:** `package.json`, `src/program/index.ts`, `src/index.ts`

## Capability
Wire the launcher onto PATH and re-export its API.

## Behavior
- `package.json` — add a `bin` field: `"bin": { "deepseek": "dist/program/bin.js" }`.
  Do NOT change `name`, `version`, `type`, `scripts`, or `devDependencies`.
- `src/program/index.ts` — re-export the launcher API:
  `export { launch, helpText, versionText, formatResult } from "./launcher.js";`
  and `export type { LauncherOptions } from "./launcher.js";`. Keep the existing
  `Program` / `main` / type re-exports exactly as-is.
- `src/index.ts` — re-export the launcher API from `./program/index.js`:
  `launch`, `helpText`, `versionText`, `formatResult`, and `type
  LauncherOptions`. Keep every existing re-export exactly as-is (the smoke test
  depends on `program` + `name`).

## Constraints
- Keep the public API stable: `Program`, `main`, `runAgent`, `Conversation`,
  `toSessionEvent`, and all existing modules are unchanged; this cycle only
  *adds* the launcher re-exports.
