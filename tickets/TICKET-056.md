# TICKET-056 — The on-PATH bin shim

**Module:** `src/program/bin.ts`

## Capability
The **on-PATH bin shim** — the file `package.json` `bin` points to. It is the
ONLY place `process.exitCode` is set.

## Behavior
- First line is the shebang `#!/usr/bin/env node`.
- Body: `import { launch } from "./launcher.js";` then
  `process.exitCode = await launch();` (top-level `await` is valid in an ESM
  module; `type:module` is set).
- Keep it to the shebang + the import + that one assignment (no logic, no
  output).

## Constraints
- `launch` returns the code; the shim assigns it. This keeps `launch` pure-ish
  and testable (it never calls `process.exit`).
- The shim is exercised indirectly through `launch` (it has no logic of its own).
