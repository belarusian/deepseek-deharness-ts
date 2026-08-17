/**
 * Public API of the on-disk Program (the four-algebra composition).
 *
 * Re-exported so downstream modules compose the Program, the CLI entrypoint,
 * the process-level launcher, and their option/result types by direct import.
 */

export { Program } from "./program.js";
export type { ProgramOptions, ProgramResult } from "./program.js";
export { main } from "./cli.js";
export type { CliOptions } from "./cli.js";
export {
  launch,
  helpText,
  versionText,
  formatResult,
  formatResultJson,
  formatToolList,
} from "./launcher.js";
export type { LauncherOptions } from "./launcher.js";
