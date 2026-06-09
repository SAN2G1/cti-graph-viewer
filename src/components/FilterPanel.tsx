import { useGraphStore } from "../store/graphStore";

export function FilterPanel() {
  const viewMode = useGraphStore((state) => state.viewMode);
  const showExternalFacts = useGraphStore((state) => state.showExternalFacts);
  const setShowExternalFacts = useGraphStore((state) => state.setShowExternalFacts);

  // Full Dependency always shows facts — no toggle. Attack Flow gets only the
  // "hide external facts" toggle.
  if (viewMode !== "attack") return null;

  return (
    <div className="filter-group">
      <label className="toggle" title="Show or hide external fact nodes">
        <input
          type="checkbox"
          checked={showExternalFacts}
          onChange={(event) => setShowExternalFacts(event.target.checked)}
        />
        External facts
      </label>
    </div>
  );
}
