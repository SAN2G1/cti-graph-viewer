import { describe, expect, it } from "vitest";
import { viewerDataToParsedWorkbook } from "../gt/viewerDataAdapter";
import type { ViewerData } from "../gt/types";

const sample: ViewerData = {
  nodes: [
    {
      node_id: "N01",
      tactic: "Execution",
      technique_id: "T1059",
      technique_name: "Command and Scripting Interpreter",
      behavior_summary: "runs powershell",
      relationships: "N01 executes F03",
      parsers: [{ fact_id: "F03", name: "p" }],
      requirements: [
        { type: "combine", operator: "AND", members: [{ type: "fact", fact_id: "F01" }] },
      ],
    },
    {
      node_id: "N02",
      tactic: "Discovery",
      technique_id: "T1083",
      technique_name: "File and Directory Discovery",
      behavior_summary: "enumerates dirs",
      relationships: "",
    },
  ],
  facts: {
    F01: { fact_id: "F01", name: "shell", is_external: true, producers: [], consumers: ["C01"] },
    F02: { fact_id: "F02", name: "host", is_external: true, producers: [], consumers: ["C01"] },
    F03: { fact_id: "F03", name: "cmdline", is_external: false, producers: ["N01"], consumers: ["N02"] },
    F04: { fact_id: "F04", name: "fs", is_external: true, producers: [], consumers: ["N02"] },
  },
  combines: [{ combine_id: "C01", operator: "AND", members: ["F01", "F02"], consumer: "N01", label: "both" }],
};

describe("viewerDataToParsedWorkbook", () => {
  const parsed = viewerDataToParsedWorkbook(sample);

  it("maps nodes, facts, and combines", () => {
    expect(parsed.nodes).toHaveLength(2);
    expect(parsed.facts).toHaveLength(4);
    expect(parsed.combines).toHaveLength(1);
  });

  it("derives fact external flags and node links", () => {
    const f3 = parsed.facts.find((f) => f.id === "F03")!;
    expect(f3.isExternal).toBe(false);
    expect(f3.producers).toEqual(["N01"]);
    expect(f3.consumers).toEqual(["N02"]);
  });

  it("reconstructs node requirements (combine for N01, direct facts for N02)", () => {
    const n01 = parsed.nodes.find((n) => n.id === "N01")!;
    const n02 = parsed.nodes.find((n) => n.id === "N02")!;
    // F01/F02 reach N01 only via the combine, so they are suppressed as direct reqs
    expect(n01.requirements).toContain("C01");
    expect(n01.requirements).not.toContain("F01");
    // N02 consumes F03 and F04 directly
    expect(n02.requirements).toEqual(expect.arrayContaining(["F03", "F04"]));
  });

  it("parses relationships and parsers", () => {
    const n01 = parsed.nodes.find((n) => n.id === "N01")!;
    expect(n01.parsers).toEqual(["F03"]);
    expect(n01.relationships.length).toBeGreaterThan(0);
  });
});
