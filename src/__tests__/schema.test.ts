import { describe, it, expect } from "vitest";
import { validateArgs } from "../index.js";
import type { JsonSchema, ValidationResult } from "../index.js";

/** Convenience: assert ok and return the result. */
function ok(schema: JsonSchema, args: unknown): ValidationResult {
  const r = validateArgs(schema, args);
  expect(r).toEqual({ ok: true });
  return r;
}

/** Convenience: assert not-ok and return the errors. */
function fail(schema: JsonSchema, args: unknown): readonly string[] {
  const r = validateArgs(schema, args);
  expect(r.ok).toBe(false);
  if (r.ok) throw new Error("expected failure");
  return r.errors;
}

describe("validateArgs — scalar types", () => {
  it("accepts and rejects string", () => {
    ok({ type: "string" }, "hi");
    expect(fail({ type: "string" }, 5)).toEqual([
      "$: expected string, got number",
    ]);
    expect(fail({ type: "string" }, null)).toEqual([
      "$: expected string, got null",
    ]);
  });

  it("accepts any finite number for type number", () => {
    ok({ type: "number" }, 3.14);
    ok({ type: "number" }, 0);
    ok({ type: "number" }, -1);
  });

  it("rejects NaN and Infinity for type number (not valid JSON)", () => {
    expect(fail({ type: "number" }, Number.NaN)).toEqual([
      "$: expected number, got number",
    ]);
    expect(fail({ type: "number" }, Number.POSITIVE_INFINITY)).toEqual([
      "$: expected number, got number",
    ]);
    expect(fail({ type: "number" }, "3")).toEqual([
      "$: expected number, got string",
    ]);
  });

  it("integer is stricter than number", () => {
    ok({ type: "integer" }, 7);
    ok({ type: "integer" }, -3);
    expect(fail({ type: "integer" }, 3.5)).toEqual([
      "$: expected integer, got number",
    ]);
    expect(fail({ type: "integer" }, Number.NaN)).toEqual([
      "$: expected integer, got number",
    ]);
    // A float that is a whole value is still an integer in JS.
    ok({ type: "integer" }, 4.0);
  });

  it("accepts and rejects boolean", () => {
    ok({ type: "boolean" }, true);
    ok({ type: "boolean" }, false);
    expect(fail({ type: "boolean" }, 1)).toEqual([
      "$: expected boolean, got number",
    ]);
  });

  it("accepts and rejects null", () => {
    ok({ type: "null" }, null);
    expect(fail({ type: "null" }, 0)).toEqual([
      "$: expected null, got number",
    ]);
  });
});

describe("validateArgs — object", () => {
  it("accepts a conforming object and rejects a non-object", () => {
    ok({ type: "object" }, { a: 1 });
    expect(fail({ type: "object" }, "str")).toEqual([
      "$: expected object, got string",
    ]);
    expect(fail({ type: "object" }, null)).toEqual([
      "$: expected object, got null",
    ]);
    expect(fail({ type: "object" }, [1, 2])).toEqual([
      "$: expected object, got array",
    ]);
  });

  it("enforces required properties (missing and undefined)", () => {
    const schema: JsonSchema = {
      type: "object",
      properties: { a: { type: "string" } },
      required: ["a"],
    };
    ok(schema, { a: "x" });
    expect(fail(schema, {})).toEqual([
      '$: missing required property "a"',
    ]);
    expect(fail(schema, { a: undefined })).toEqual([
      '$: missing required property "a"',
    ]);
  });

  it("validates nested property schemas with path-qualified errors", () => {
    const schema: JsonSchema = {
      type: "object",
      properties: {
        a: {
          type: "object",
          properties: { b: { type: "string" } },
          required: ["b"],
        },
      },
    };
    ok(schema, { a: { b: "ok" } });
    expect(fail(schema, { a: { b: 5 } })).toEqual([
      "$.a.b: expected string, got number",
    ]);
    expect(fail(schema, { a: 5 })).toEqual([
      "$.a: expected object, got number",
    ]);
  });

  it("additionalProperties:false rejects undeclared keys", () => {
    const schema: JsonSchema = {
      type: "object",
      properties: { a: { type: "string" } },
      additionalProperties: false,
    };
    ok(schema, { a: "x" });
    expect(fail(schema, { a: "x", z: 1 })).toEqual([
      "$.z: undeclared property (additionalProperties: false)",
    ]);
  });

  it("additionalProperties absent/true accepts undeclared keys (open default)", () => {
    ok({ type: "object", properties: { a: { type: "string" } } }, {
      a: "x",
      z: 1,
    });
    ok({ type: "object", additionalProperties: true }, { z: 1 });
  });

  it("multiple violations are all reported", () => {
    const schema: JsonSchema = {
      type: "object",
      properties: { a: { type: "string" }, b: { type: "number" } },
      required: ["a", "b"],
    };
    const errs = fail(schema, { a: 1 });
    expect(errs).toContain("$.a: expected string, got number");
    expect(errs).toContain('$: missing required property "b"');
  });
});

describe("validateArgs — array", () => {
  it("accepts and rejects array", () => {
    ok({ type: "array" }, [1, 2, 3]);
    expect(fail({ type: "array" }, "nope")).toEqual([
      "$: expected array, got string",
    ]);
  });

  it("validates items with index-qualified paths", () => {
    const schema: JsonSchema = {
      type: "array",
      items: { type: "number" },
    };
    ok(schema, [1, 2, 3]);
    ok(schema, []);
    expect(fail(schema, [1, "x", 3])).toEqual([
      "$[1]: expected number, got string",
    ]);
  });

  it("absent items accepts any JSON item", () => {
    ok({ type: "array" }, [1, "x", null, { a: 1 }]);
  });

  it("nested items (array of objects)", () => {
    const schema: JsonSchema = {
      type: "array",
      items: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
      },
    };
    ok(schema, [{ id: "a" }, { id: "b" }]);
    expect(fail(schema, [{ id: 1 }])).toEqual([
      "$[0].id: expected string, got number",
    ]);
  });
});

describe("validateArgs — scalar enum / const", () => {
  it("enforces enum membership", () => {
    const schema: JsonSchema = { type: "string", enum: ["a", "b", "c"] };
    ok(schema, "a");
    expect(fail(schema, "z")).toEqual([
      '$: expected one of ["a","b","c"], got "z"',
    ]);
  });

  it("enforces const equality", () => {
    const schema: JsonSchema = { type: "number", const: 42 };
    ok(schema, 42);
    expect(fail(schema, 43)).toEqual(["$: expected 42, got 43"]);
  });

  it("enum/const on a boolean", () => {
    ok({ type: "boolean", const: true }, true);
    expect(fail({ type: "boolean", const: true }, false)).toEqual([
      "$: expected true, got false",
    ]);
  });

  it("enum and const together (value must satisfy both)", () => {
    const schema: JsonSchema = { type: "string", enum: ["a", "b"], const: "a" };
    ok(schema, "a");
    expect(fail(schema, "b")).toEqual(["$: expected \"a\", got \"b\""]);
  });
});

describe("validateArgs — misplaced keywords (reject-not-ignore)", () => {
  it("properties on a non-object is an error", () => {
    const errs = fail(
      { type: "string", properties: { a: { type: "string" } } } as JsonSchema,
      "x",
    );
    expect(errs.some((e) => e.includes("only valid on type \"object\""))).toBe(
      true,
    );
  });

  it("items on a non-array is an error", () => {
    const errs = fail(
      { type: "object", items: { type: "number" } } as JsonSchema,
      {},
    );
    expect(errs.some((e) => e.includes('"items" is only valid on type "array"'))).toBe(
      true,
    );
  });

  it("enum/const on object is an error", () => {
    const errs = fail({ type: "object", const: {} } as JsonSchema, {});
    expect(
      errs.some((e) => e.includes("only valid on scalar types")),
    ).toBe(true);
  });

  it("constraint keyword without a type is an error", () => {
    const errs = fail({ properties: { a: { type: "string" } } } as JsonSchema, {});
    expect(errs).toEqual(['$: keyword "properties" requires a "type"']);
  });

  it("unknown type name is an error", () => {
    expect(fail({ type: "banana" } as JsonSchema, "x")).toEqual([
      '$: unknown type "banana"',
    ]);
  });
});

describe("validateArgs — empty / annotation-only schema", () => {
  it("an empty schema accepts any JSON value", () => {
    ok({}, "anything");
    ok({}, 42);
    ok({}, null);
    ok({}, { a: [1, 2] });
    ok({}, [1, "x"]);
  });

  it("a schema with only a type accepts conforming values", () => {
    ok({ type: "object" }, { whatever: true });
  });
});
