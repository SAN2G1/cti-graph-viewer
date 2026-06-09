import { useGraphStore } from "../store/graphStore";

export function SummaryBar() {
  const parsed = useGraphStore((state) => state.parsed);
  if (!parsed) {
    return <div className="summary-bar">Load viewer_data.json via the Load Data button above to render the graph.</div>;
  }

  const externalFacts = parsed.facts.filter((fact) => fact.isExternal).length;

  return (
    <div className="summary-bar">
      <span>Nodes: {parsed.nodes.length}</span>
      <span>Facts: {parsed.facts.length}</span>
      <span>Combines: {parsed.combines.length}</span>
      <span>External Facts: {externalFacts}</span>
    </div>
  );
}
