/**
 * **JSON-Schema argument validation** for the tools module.
 *
 * `validateArgs` checks a tool's `args` against its `parameters` schema and
 * returns a total {@link ValidationResult}. It enforces a **minimal,
 * dependency-free JSON-Schema subset** — the same *shape* and the same
 * reject-not-ignore stance as the seed's enforced subset, but scoped to the
 * keywords the tools pipeline needs (no `oneOf` this cycle):
 *
 * - scalar `type`: `string` / `number` / `integer` / `boolean` / `null`
 * - `object` with `properties` / `required` / `additionalProperties`
 * - `array` with `items`
 * - scalar `enum` / `const`
 *
 * A keyword that is **misplaced** for a node's `type` (e.g. `properties` on a
 * non-object, `items` on a non-array, `enum`/`const` on object/array) is a
 * validation error rather than being silently ignored. An absent/empty schema
 * (no `type`, no constraint keywords) accepts any JSON value.
 *
 * `errors` are human-readable, **path-qualified** strings rooted at `$`
 * (e.g. `$.a.b: expected object, got string`).
 *
 * This module validates the tools module's own {@link JsonSchema}; it does not
 * redefine the LLM seam's `ToolDefinition` / `ToolCallBlock` /
 * `ToolResultBlock`.
 */

import type { JsonSchema } from "./types.js";

/**
 * The total outcome of validating one argument object against a schema.
 *
 * `ok: true` means the value conforms. `ok: false` carries every violation in
 * walk order (path-qualified, human-readable).
 */
export type ValidationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly errors: readonly string[] };

/** The scalar + container type names the subset recognizes. */
const KNOWN_TYPES: ReadonlySet<string> = new Set([
  "string",
  "number",
  "integer",
  "boolean",
  "null",
  "object",
  "array",
]);

/** Constraint keywords that require a `type` to be meaningful. */
const CONSTRAINT_KEYWORDS: readonly string[] = [
  "properties",
  "required",
  "additionalProperties",
  "items",
  "enum",
  "const",
];

/** A human-readable name for the runtime type of a value (for diagnostics). */
function jsTypeName(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

/** Whether a value is a finite JSON number (excludes NaN / Infinity). */
function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Validate a candidate value against a schema node, appending every violation
 * (path-qualified) to `errors`. Total for arbitrary values; never throws.
 */
function checkNode(
  schema: JsonSchema,
  value: unknown,
  path: string,
  errors: string[],
): void {
  const type = typeof schema.type === "string" ? schema.type : undefined;
  const hasType = type !== undefined;

  const present = CONSTRAINT_KEYWORDS.filter((k) => Object.hasOwn(schema, k));

  // ── no type ──────────────────────────────────────────────────────────────
  if (!hasType) {
    // An empty / annotation-only schema accepts any JSON value. Constraint
    // keywords without a type are a schema-authoring error (reject, don't
    // ignore) — they cannot be enforced without a type to anchor them to.
    for (const k of present) {
      errors.push(`${path}: keyword "${k}" requires a "type"`);
    }
    return;
  }

  // ── unknown type name ────────────────────────────────────────────────────
  if (!KNOWN_TYPES.has(type)) {
    errors.push(`${path}: unknown type "${type}"`);
    return;
  }

  // ── misplaced-keyword checks (reject-not-ignore) ─────────────────────────
  const hasObjectKw =
    Object.hasOwn(schema, "properties") ||
    Object.hasOwn(schema, "required") ||
    Object.hasOwn(schema, "additionalProperties");
  if (hasObjectKw && type !== "object") {
    errors.push(
      `${path}: "properties"/"required"/"additionalProperties" are only valid on type "object", not "${type}"`,
    );
  }
  if (Object.hasOwn(schema, "items") && type !== "array") {
    errors.push(
      `${path}: "items" is only valid on type "array", not "${type}"`,
    );
  }
  if (
    (Object.hasOwn(schema, "enum") || Object.hasOwn(schema, "const")) &&
    (type === "object" || type === "array")
  ) {
    errors.push(
      `${path}: "enum"/"const" are only valid on scalar types, not "${type}"`,
    );
  }

  // ── value conformance per type ───────────────────────────────────────────
  switch (type) {
    case "string":
      if (typeof value !== "string") {
        errors.push(`${path}: expected string, got ${jsTypeName(value)}`);
        return;
      }
      checkScalarConstraints(schema, value, path, errors);
      break;
    case "number":
      if (!isFiniteNumber(value)) {
        errors.push(`${path}: expected number, got ${jsTypeName(value)}`);
        return;
      }
      checkScalarConstraints(schema, value, path, errors);
      break;
    case "integer":
      if (!isFiniteNumber(value) || !Number.isInteger(value)) {
        errors.push(`${path}: expected integer, got ${jsTypeName(value)}`);
        return;
      }
      checkScalarConstraints(schema, value, path, errors);
      break;
    case "boolean":
      if (typeof value !== "boolean") {
        errors.push(`${path}: expected boolean, got ${jsTypeName(value)}`);
        return;
      }
      checkScalarConstraints(schema, value, path, errors);
      break;
    case "null":
      if (value !== null) {
        errors.push(`${path}: expected null, got ${jsTypeName(value)}`);
        return;
      }
      checkScalarConstraints(schema, value, path, errors);
      break;
    case "object":
      if (value === null || typeof value !== "object" || Array.isArray(value)) {
        errors.push(`${path}: expected object, got ${jsTypeName(value)}`);
        return;
      }
      checkObject(schema, value as Record<string, unknown>, path, errors);
      break;
    case "array":
      if (!Array.isArray(value)) {
        errors.push(`${path}: expected array, got ${jsTypeName(value)}`);
        return;
      }
      checkArray(schema, value, path, errors);
      break;
    /* KNOWN_TYPES is closed; the switch above is exhaustive. */
  }
}

/** Enforce scalar `enum` / `const` on a value already known to be a scalar. */
function checkScalarConstraints(
  schema: JsonSchema,
  value: unknown,
  path: string,
  errors: string[],
): void {
  if (Object.hasOwn(schema, "enum")) {
    const enumVals = schema.enum;
    if (!Array.isArray(enumVals)) {
      errors.push(`${path}: "enum" must be an array`);
    } else if (!enumVals.includes(value)) {
      errors.push(
        `${path}: expected one of ${JSON.stringify(enumVals)}, got ${JSON.stringify(value)}`,
      );
    }
  }
  if (Object.hasOwn(schema, "const")) {
    if (value !== schema.const) {
      errors.push(
        `${path}: expected ${JSON.stringify(schema.const)}, got ${JSON.stringify(value)}`,
      );
    }
  }
}

/** Enforce object `required` / `properties` / `additionalProperties`. */
function checkObject(
  schema: JsonSchema,
  value: Record<string, unknown>,
  path: string,
  errors: string[],
): void {
  const required = schema.required;
  if (required) {
    for (const key of required) {
      if (!Object.hasOwn(value, key) || value[key] === undefined) {
        errors.push(`${path}: missing required property "${key}"`);
      }
    }
  }

  const properties = schema.properties;
  if (properties) {
    for (const [key, childSchema] of Object.entries(properties)) {
      if (Object.hasOwn(value, key) && value[key] !== undefined) {
        checkNode(childSchema, value[key], `${path}.${key}`, errors);
      }
    }
  }

  if (schema.additionalProperties === false) {
    const declared = properties ? Object.keys(properties) : [];
    for (const key of Object.keys(value)) {
      if (!declared.includes(key)) {
        errors.push(
          `${path}.${key}: undeclared property (additionalProperties: false)`,
        );
      }
    }
  }
}

/** Enforce array `items` (absent `items` accepts any JSON item). */
function checkArray(
  schema: JsonSchema,
  value: unknown[],
  path: string,
  errors: string[],
): void {
  const items = schema.items;
  if (items !== undefined) {
    const itemSchema = items as JsonSchema;
    for (let i = 0; i < value.length; i++) {
      checkNode(itemSchema, value[i], `${path}[${i}]`, errors);
    }
  }
}

/**
 * Validate a tool's `args` against its `parameters` schema.
 *
 * Total for arbitrary `args` and any {@link JsonSchema}; never throws. Returns
 * `{ ok: true }` when the value conforms, otherwise `{ ok: false, errors }`
 * with every violation in walk order.
 *
 * @param schema - the tool's parameter schema (may be empty / annotation-only).
 * @param args - the parsed argument value to check.
 */
export function validateArgs(
  schema: JsonSchema,
  args: unknown,
): ValidationResult {
  const errors: string[] = [];
  checkNode(schema, args, "$", errors);
  if (errors.length === 0) return { ok: true };
  return { ok: false, errors };
}
