import type cytoscape from "cytoscape";
import type { ParsedWorkbook } from "../types/graph";
import { buildCytoscapeElements } from "./graphBuilder";

export function exportJson(input: ParsedWorkbook): void {
  const payload = {
    nodes: input.nodes,
    facts: input.facts,
    combines: input.combines,
    diagnostics: input.diagnostics,
    graph: {
      elements: buildCytoscapeElements(input, { viewMode: "full", severityFilter: "all", showExternalFacts: true, showExecutionRequiredFacts: true }),
    },
  };
  downloadBlob(JSON.stringify(payload, null, 2), "cti-dependency-graph.json", "application/json");
}

export function exportPng(cy: cytoscape.Core | null): void {
  if (!cy) return;
  const dataUrl = cy.png({ full: true, scale: 2, bg: "#ffffff" });
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = "cti-dependency-graph.png";
  link.click();
}

function downloadBlob(content: string, filename: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
