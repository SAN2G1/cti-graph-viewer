import { describe, expect, it } from "vitest";
import type { ViewerData } from "../gt/types";
import {
  FACT_ID_RE,
  normalizeTactic,
  parseBooleanCell,
  summarizeValidationIssues,
  validateViewerData,
  validateWorkbookDataRows,
  validateWorkbookHeaders,
  validateWorkbookRows,
} from "../gt/validation";

describe("validation model helpers", () => {
  it("accepts fact IDs without suffix letters only", () => {
    expect(FACT_ID_RE.test("F1")).toBe(true);
    expect(FACT_ID_RE.test("F01")).toBe(true);
    expect(FACT_ID_RE.test("F01a")).toBe(false);
  });

  it("normalizes tactic names case-insensitively", () => {
    expect(normalizeTactic("execution")).toBe("Execution");
    expect(normalizeTactic("COMMAND AND CONTROL")).toBe("Command and Control");
    expect(normalizeTactic("not a tactic")).toBeNull();
  });

  it("parses explicit workbook boolean cells only", () => {
    expect(parseBooleanCell("TRUE")).toBe(true);
    expect(parseBooleanCell("yes")).toBe(true);
    expect(parseBooleanCell("0")).toBe(false);
    expect(parseBooleanCell("no")).toBe(false);
    expect(parseBooleanCell("")).toBeNull();
    expect(parseBooleanCell("maybe")).toBeNull();
  });

  it("summarizes issues by severity", () => {
    const summary = summarizeValidationIssues([
      { id: "1", severity: "error", code: "id.invalid_fact_id", message: "bad fact" },
      { id: "2", severity: "warning", code: "schema.extra_column", message: "extra column" },
      { id: "3", severity: "info", code: "reachability.unreachable_node", message: "unreachable" },
    ]);

    expect(summary).toEqual({ total: 3, errors: 1, warnings: 1, infos: 1 });
  });

  it("reports workbook header schema issues", () => {
    const issues = validateWorkbookHeaders("node", "node.xlsx", [
      "NODE_ID",
      "tactic",
      "technique_id",
      "technique_name",
      "behavior_summary",
      "requirements",
      "relationships",
      "parsers",
      "unexpected",
    ]);

    expect(issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "schema.missing_column",
      "schema.extra_column",
    ]));
    expect(issues.find((issue) => issue.code === "schema.missing_column")?.field).toBe("ref");
    expect(issues.find((issue) => issue.code === "schema.extra_column")?.field).toBe("unexpected");
  });

  it("reports workbook header order drift separately", () => {
    const issues = validateWorkbookHeaders("combine", "combine.xlsx", [
      "operator",
      "combine_id",
      "members",
      "consumer",
      "label",
    ]);

    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe("schema.column_order");
    expect(issues[0].severity).toBe("warning");
  });

  it("reports invalid fact row is_external values before conversion", () => {
    const issues = validateWorkbookRows("fact", "fact.xlsx", [
      { fact_id: "F01", is_external: "true" },
      { fact_id: "F02", is_external: "maybe" },
      { fact_id: "F03", is_external: "" },
    ]);

    expect(issues).toHaveLength(2);
    expect(issues.map((issue) => issue.code)).toEqual([
      "value.invalid_is_external",
      "value.invalid_is_external",
    ]);
    expect(issues.map((issue) => issue.entityId)).toEqual(["F02", "F03"]);
  });

  it("reports workbook references that would be dropped during viewer conversion", () => {
    const issues = validateWorkbookDataRows({
      nodeRows: [
        { node_id: "N01", requirements: "F01, C99", parsers: "Missing fact" },
        { node_id: "N02", requirements: "bad-ref", parsers: "F99" },
      ],
      factRows: [
        { fact_id: "F01", name: "Known fact" },
        { fact_id: "F01", name: "Duplicate fact" },
      ],
      combineRows: [{ combine_id: "C01" }],
    });

    expect(issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "id.duplicate",
      "ref.missing",
      "ref.wrong_type",
    ]));
    expect(issues.some((issue) => issue.message.includes("C99"))).toBe(true);
    expect(issues.some((issue) => issue.message.includes("F99"))).toBe(true);
    expect(issues.some((issue) => issue.message.includes("Missing fact"))).toBe(true);
  });

  it("accepts a mechanically consistent viewer dataset", () => {
    const data: ViewerData = {
      nodes: [
        {
          node_id: "N01",
          tactic: "execution",
          technique_id: "T1059",
          requirements: [{ type: "fact", fact_id: "F01" }],
          parsers: [{ fact_id: "F02" }],
        },
        {
          node_id: "N02",
          tactic: "Discovery",
          technique_id: "T1083",
          requirements: [{ type: "fact", fact_id: "F02" }],
        },
      ],
      facts: {
        F01: { fact_id: "F01", is_external: true, producers: [], consumers: ["N01"], level: "report_explicit" },
        F02: { fact_id: "F02", is_external: false, producers: ["N01"], consumers: ["N02"], level: "execution_required" },
      },
      combines: [],
    };

    expect(validateViewerData(data).issues).toEqual([]);
  });

  it("reports invalid IDs, missing references, and mismatched parser links", () => {
    const data: ViewerData = {
      nodes: [
        {
          node_id: "N01",
          tactic: "NotATactic",
          technique_id: "Tbad",
          requirements: [{ type: "fact", fact_id: "F99" }],
          parsers: [{ fact_id: "F01a" }, { fact_id: "F02" }],
        },
      ],
      facts: {
        F02: { fact_id: "F02", is_external: false, producers: [], consumers: ["N01"], level: "bad_level" },
      },
      combines: [],
    };

    const codes = validateViewerData(data).issues.map((issue) => issue.code);
    expect(codes).toEqual(expect.arrayContaining([
      "id.invalid_fact_id",
      "id.invalid_technique_id",
      "value.invalid_tactic",
      "value.invalid_level",
      "ref.missing",
      "consistency.parser_producer_mismatch",
    ]));
  });

  it("reports combine cycles and unresolved members", () => {
    const data: ViewerData = {
      nodes: [{ node_id: "N01", tactic: "Execution", requirements: [{ type: "fact", fact_id: "F01" }] }],
      facts: {
        F01: { fact_id: "F01", is_external: true, producers: [], consumers: ["C01"] },
      },
      combines: [
        { combine_id: "C01", operator: "AND", members: ["F01", "C02"], consumer: "N01" },
        { combine_id: "C02", operator: "OR", members: ["C01", "F99"], consumer: "C01" },
      ],
    };

    const codes = validateViewerData(data).issues.map((issue) => issue.code);
    expect(codes).toContain("combine.cycle");
    expect(codes).toContain("ref.missing");
  });
});
