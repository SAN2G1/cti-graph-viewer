import { useGraphStore } from "../store/graphStore";
import { expandCombineToLeafFacts, expandRequirementToLeafFacts } from "../utils/combineResolver";

export function DetailPanel() {
  const parsed = useGraphStore((state) => state.parsed);
  const selectedIds = useGraphStore((state) => state.selectedIds);

  if (!parsed) return <aside className="detail-panel"><h2>Selected Entity</h2><p>No data loaded.</p></aside>;

  const selectedId = selectedIds[0];
  if (!selectedId) return <aside className="detail-panel"><h2>Selected Entity</h2><p>Select a graph object.</p></aside>;

  const node = parsed.nodes.find((item) => item.id === selectedId);
  const fact = parsed.facts.find((item) => item.id === selectedId);
  const combine = parsed.combines.find((item) => item.id === selectedId);
  const combineMap = new Map(parsed.combines.map((item) => [item.id, item]));

  if (node) {
    const expanded = expandRequirementToLeafFacts(node.requirements, combineMap);
    return (
      <aside className="detail-panel">
        <h2>{node.id}</h2>
        <EntityRows rows={[
          ["Tactic", node.tactic],
          ["Technique", `${node.techniqueId} ${node.techniqueName}`],
          ["Behavior", node.behaviorSummary],
          ["Requirements", node.requirements.join(", ") || "-"],
          ["Leaf Requirements", expanded.facts.join(", ") || "-"],
          ["Relationships", node.relationships.map((rel) => rel.raw).join("; ") || "-"],
          ["Parsers", node.parsers.join(", ") || "-"],
          ["Ref", node.ref ?? "-"],
        ]} />
      </aside>
    );
  }

  if (fact) {
    return (
      <aside className="detail-panel">
        <h2>{fact.id}</h2>
        <EntityRows rows={[
          ["Name", fact.name],
          ["Producers", fact.producers.join(", ") || "-"],
          ["Consumers", fact.consumers.join(", ") || "-"],
          ["External", `${fact.isExternalRaw} (${fact.isExternal === null ? "invalid" : String(fact.isExternal)})`],
          ["Level", fact.level],
          ["Description", fact.description],
          ["Ref", fact.ref ?? "-"],
        ]} />
      </aside>
    );
  }

  if (combine) {
    const expanded = expandCombineToLeafFacts(combine.id, combineMap);
    const nested = parsed.combines.some((item) => item.members.includes(combine.id));
    return (
      <aside className="detail-panel">
        <h2>{combine.id}</h2>
        <EntityRows rows={[
          ["Operator", combine.operator],
          ["Members", combine.members.join(", ") || "-"],
          ["Leaf Facts", expanded.facts.join(", ") || "-"],
          ["Consumer", combine.consumer.join(", ") || "-"],
          ["Label", combine.label],
          ["Nested", nested ? "yes" : "no"],
          ["Cycle", expanded.hasCycle ? expanded.path.join(" → ") : "no"],
        ]} />
      </aside>
    );
  }

  return <aside className="detail-panel"><h2>{selectedId}</h2><p>No parsed entity found.</p></aside>;
}

function EntityRows({ rows }: { rows: Array<[string, string]> }) {
  return (
    <dl className="entity-rows">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value || "-"}</dd>
        </div>
      ))}
    </dl>
  );
}
