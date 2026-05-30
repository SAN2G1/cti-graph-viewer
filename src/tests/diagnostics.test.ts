import { describe, expect, it } from "vitest";
import type { AttackNode, Combine, Fact, ParsedWorkbook } from "../types/graph";
import { runAllDiagnostics } from "../utils/diagnostics";

describe("diagnostics", () => {
  it("detects producer parser mismatch", () => {
    const diagnostics = runAllDiagnostics(workbook({
      nodes: [node("N01", [], [])],
      facts: [fact("F01", false, ["N01"], [])],
    }));
    expect(diagnostics.some((diagnostic) => diagnostic.type === "producer_parser_mismatch")).toBe(true);
  });

  it("detects requirements consumers mismatch", () => {
    const diagnostics = runAllDiagnostics(workbook({
      nodes: [node("N01", ["F01"], [])],
      facts: [fact("F01", true, [], [])],
    }));
    expect(diagnostics.some((diagnostic) => diagnostic.type === "requirement_consumer_mismatch")).toBe(true);
  });

  it("detects external producer conflicts", () => {
    const diagnostics = runAllDiagnostics(workbook({
      nodes: [node("N01", [], ["F01"])],
      facts: [fact("F01", true, ["N01"], [])],
    }));
    expect(diagnostics.some((diagnostic) => diagnostic.type === "external_producer_conflict")).toBe(true);
  });

  it("detects internal facts without producers", () => {
    const diagnostics = runAllDiagnostics(workbook({
      facts: [fact("F01", false, [], [])],
    }));
    expect(diagnostics.some((diagnostic) => diagnostic.type === "internal_without_producer")).toBe(true);
  });

  it("detects multiple requirements without combine", () => {
    const diagnostics = runAllDiagnostics(workbook({
      nodes: [node("N01", ["F01", "F02"], [])],
      facts: [fact("F01", true, [], ["N01"]), fact("F02", true, [], ["N01"])],
    }));
    expect(diagnostics.some((diagnostic) => diagnostic.type === "multi_requirement_without_combine")).toBe(true);
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
    raw: { requirements, parsers },
    rowIndex: 2,
  };
}

function fact(id: string, isExternal: boolean, producers: string[], consumers: string[]): Fact {
  return {
    id,
    type: "fact",
    name: id,
    producers,
    consumers,
    isExternalRaw: isExternal ? "TRUE" : "FALSE",
    isExternal,
    level: "report_explicit",
    description: "",
    raw: { producers, consumers },
    rowIndex: 2,
  };
}
