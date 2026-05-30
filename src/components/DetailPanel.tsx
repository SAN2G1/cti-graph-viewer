import { useGraphStore } from "../store/graphStore";
import { expandCombineToLeafFacts, expandRequirementToLeafFacts } from "../utils/combineResolver";

export function DetailPanel() {
  const parsed = useGraphStore((state) => state.parsed);
  const selectedIds = useGraphStore((state) => state.selectedIds);
  const selectedDiagnostic = useGraphStore((state) => state.selectedDiagnostic);

  if (!parsed) return <aside className="detail-panel"><h2>Selected Entity</h2><p>No workbook loaded.</p></aside>;
  if (selectedDiagnostic) {
    return (
      <aside className="detail-panel">
        <h2>Diagnostic</h2>
        <EntityRows rows={[
          ["Check", `[${selectedDiagnostic.checkNo}]`],
          ["Severity", selectedDiagnostic.severity],
          ["Type", selectedDiagnostic.type],
          ["Related IDs", selectedDiagnostic.relatedIds.join(", ") || "-"],
          ["Suggested Fix", selectedDiagnostic.suggestedFix ?? "-"],
        ]} />
        <p className="diagnostic-message">{selectedDiagnostic.message}</p>
      </aside>
    );
  }

  const selectedId = selectedIds[0];
  if (!selectedId) return <aside className="detail-panel"><h2>Selected Entity</h2><p>Select a graph object or diagnostic.</p></aside>;

  const node = parsed.nodes.find((item) => item.id === selectedId);
  const fact = parsed.facts.find((item) => item.id === selectedId);
  const combine = parsed.combines.find((item) => item.id === selectedId);
  const relatedDiagnostics = parsed.diagnostics.filter((diagnostic) => diagnostic.relatedIds.includes(selectedId));
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
        <RelatedDiagnostics diagnostics={relatedDiagnostics} />
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
        <RelatedDiagnostics diagnostics={relatedDiagnostics} />
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
        <RelatedDiagnostics diagnostics={relatedDiagnostics} />
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

function RelatedDiagnostics({ diagnostics }: { diagnostics: import("../types/graph").GraphDiagnostic[] }) {
  return (
    <div className="related-diagnostics">
      <h3>Related Diagnostics</h3>
      {diagnostics.length === 0 ? <p>None</p> : diagnostics.map((diagnostic) => (
        <p key={diagnostic.id} className={`severity-${diagnostic.severity}`}>
          [{diagnostic.checkNo}] {diagnostic.message}
        </p>
      ))}
    </div>
  );
}
