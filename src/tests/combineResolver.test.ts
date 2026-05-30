import { describe, expect, it } from "vitest";
import type { Combine } from "../types/graph";
import { expandCombineToLeafFacts } from "../utils/combineResolver";

describe("combineResolver", () => {
  it("extracts leaf facts from a flat AND combine", () => {
    const combines = mapCombines([{ id: "C01", operator: "AND", members: ["F01", "F02"] }]);
    expect(expandCombineToLeafFacts("C01", combines).facts.sort()).toEqual(["F01", "F02"]);
  });

  it("extracts leaf facts from nested combines", () => {
    const combines = mapCombines([
      { id: "C01", operator: "AND", members: ["F01", "F02"] },
      { id: "C02", operator: "OR", members: ["C01", "F03"] },
    ]);
    expect(expandCombineToLeafFacts("C02", combines).facts.sort()).toEqual(["F01", "F02", "F03"]);
  });

  it("detects combine cycles", () => {
    const combines = mapCombines([
      { id: "C01", operator: "AND", members: ["F01", "C02"] },
      { id: "C02", operator: "OR", members: ["C01", "F02"] },
    ]);
    const result = expandCombineToLeafFacts("C01", combines);
    expect(result.hasCycle).toBe(true);
    expect(result.path).toEqual(["C01", "C02", "C01"]);
  });
});

function mapCombines(combines: Array<Pick<Combine, "id" | "operator" | "members">>): Map<string, Combine> {
  return new Map(
    combines.map((combine) => [
      combine.id,
      {
        ...combine,
        type: "combine" as const,
        consumer: [],
        label: "",
        raw: {},
        rowIndex: 2,
      },
    ]),
  );
}
