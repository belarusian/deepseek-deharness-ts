import { describe, it, expect } from "vitest";
import { name, program } from "../index.js";

describe("deepseek-deharness-ts smoke", () => {
  it("exports the program name", () => {
    expect(name).toBe("deepseek-deharness-ts");
  });

  it("exposes a Program marker with a clean API", () => {
    expect(program).toEqual({ name: "deepseek-deharness-ts" });
  });
});
