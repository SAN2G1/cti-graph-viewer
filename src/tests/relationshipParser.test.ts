import { describe, expect, it } from "vitest";
import { parseRelationshipCell } from "../utils/relationshipParser";

describe("relationshipParser", () => {
  it("parses canonical creation from dash to fact", () => {
    expect(parseRelationshipCell("creates(— → F01)")[0]).toMatchObject({
      verb: "creates",
      source: "—",
      target: "F01",
      isCanonical: true,
    });
  });

  it("parses canonical fact transfer", () => {
    expect(parseRelationshipCell("transfers(F01 → F02)")[0]).toMatchObject({
      verb: "transfers",
      source: "F01",
      target: "F02",
      isCanonical: true,
    });
  });

  it("marks unsupported verbs", () => {
    expect(parseRelationshipCell("invented(F01 → F02)")[0].verb).toBeUndefined();
  });

  it("parses ASCII arrows but marks canonical format violation", () => {
    expect(parseRelationshipCell("creates(F01 -> F02)")[0]).toMatchObject({
      source: "F01",
      target: "F02",
      isCanonical: false,
    });
  });
});
