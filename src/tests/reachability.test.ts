import { describe, expect, it } from "vitest";
import type { AttackNode, Combine, Fact, ParsedWorkbook } from "../types/graph";
import { runReachabilitySimulation } from "../utils/reachability";

describe("reachability", () => {
  it("executes nodes from external facts and nodes without requirements", () => {
    const result = runReachabilitySimulation(workbook({
      nodes: [
        node("N01", [], ["F02"]),
        node("N02", ["F01"], ["F03"]),
      ],
      facts: [fact("F01", true), fact("F02", false), fact("F03", false)],
    }));
    expect([...result.executedNodes].sort()).toEqual(["N01", "N02"]);
  });

  it("satisfies AND and OR combines", () => {
    const result = runReachabilitySimulation(workbook({
      nodes: [
        node("N01", ["C01"], ["F03"]),
        node("N02", ["C02"], ["F04"]),
      ],
      facts: [fact("F01", true), fact("F02", true), fact("F03", false), fact("F04", false)],
      combines: [
        combine("C01", "AND", ["F01", "F02"]),
        combine("C02", "OR", ["F99", "F03"]),
      ],
    }));
    expect(result.executedNodes.has("N01")).toBe(true);
    expect(result.executedNodes.has("N02")).toBe(true);
  });

  it("detects unreachable nodes and unproducible facts", () => {
    const result = runReachabilitySimulation(workbook({
      nodes: [node("N01", ["F99"], ["F02"])],
      facts: [fact("F01", true), fact("F02", false)],
    }));
    expect(result.unreachableNodes).toEqual(["N01"]);
    expect(result.unproducibleFacts).toEqual(["F02"]);
  });
});

function workbook(input: { nodes?: AttackNode[]; facts?: Fact[]; combines?: Combine[] }): ParsedWorkbook {
  return { nodes: input.nodes ?? [], facts: input.facts ?? [], combines: input.combines ?? [], diagnostics: [] };
}

function node(id: string, requirements: string[], parsers: string[]): AttackNode {
  return {
    id,
    type: "node",
    tactic: "Execution",
    techniqueId: "T1059",
    techniqueName: "Command and Scripting Interpreter",
    behaviorSummary: "",
    requirements,
    relationships: [],
    parsers,
    raw: {},
    rowIndex: 2,
  };
}

function fact(id: string, isExternal: boolean): Fact {
  return {
    id,
    type: "fact",
    name: id,
    producers: [],
    consumers: [],
    isExternalRaw: isExternal ? "TRUE" : "FALSE",
    isExternal,
    level: "report_explicit",
    description: "",
    raw: {},
    rowIndex: 2,
  };
}

function combine(id: string, operator: string, members: string[]): Combine {
  return { id, type: "combine", operator, members, consumer: [], label: "", raw: {}, rowIndex: 2 };
}
