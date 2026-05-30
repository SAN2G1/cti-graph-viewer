import { describe, expect, it } from "vitest";
import { classifyId, normalizeFactId, parseIdsFromCell } from "../utils/idParser";

describe("idParser", () => {
  it("parses mixed fact and combine IDs", () => {
    expect(parseIdsFromCell("F01, F02, C03")).toEqual(["F01", "F02", "C03"]);
  });

  it("parses bracketed node IDs", () => {
    expect(parseIdsFromCell("[N01, N02]")).toEqual(["N01", "N02"]);
  });

  it("normalizes fact suffix casing", () => {
    expect(normalizeFactId("f23A")).toBe("F23a");
  });

  it("detects invalid IDs after parsing", () => {
    expect(classifyId("X01")).toBe("unknown");
  });
});
