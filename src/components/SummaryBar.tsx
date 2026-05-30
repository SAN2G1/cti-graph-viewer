import { useGraphStore } from "../store/graphStore";

export function SummaryBar() {
  const parsed = useGraphStore((state) => state.parsed);
  if (!parsed) {
    return <div className="summary-bar">Upload Node, Fact, Combine tables or a combined workbook to begin.</div>;
  }

  const errors = parsed.diagnostics.filter((diagnostic) => diagnostic.severity === "error").length;
  const warnings = parsed.diagnostics.filter((diagnostic) => diagnostic.severity === "warning").length;
  const externalFacts = parsed.facts.filter((fact) => fact.isExternal).length;
  const unreachableNodes = parsed.diagnostics.filter((diagnostic) => diagnostic.type === "unreachable_node").length;
  const unproducibleFacts = parsed.diagnostics.filter((diagnostic) => diagnostic.type === "unproducible_fact").length;

  return (
    <div className="summary-bar">
      <span>Nodes: {parsed.nodes.length}</span>
      <span>Facts: {parsed.facts.length}</span>
      <span>Combines: {parsed.combines.length}</span>
      <span>Errors: {errors}</span>
      <span>Warnings: {warnings}</span>
      <span>External Facts: {externalFacts}</span>
      <span>Unreachable Nodes: {unreachableNodes}</span>
      <span>Unproducible Facts: {unproducibleFacts}</span>
    </div>
  );
}
