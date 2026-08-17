#!/usr/bin/env node
/**
 * The **on-PATH bin shim** (TICKET-056) — the file `package.json` `bin` points
 * to. It is the ONLY place `process.exitCode` is set: `launch` returns the
 * code, and the shim assigns it. No logic, no output of its own.
 */

import { launch } from "./launcher.js";

process.exitCode = await launch();
