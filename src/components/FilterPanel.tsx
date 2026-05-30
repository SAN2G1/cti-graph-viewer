import { ALLOWED_TACTICS } from "../constants/allowedValues";
import { useGraphStore } from "../store/graphStore";

export function FilterPanel() {
  const tacticFilter = useGraphStore((state) => state.tacticFilter);
  const severityFilter = useGraphStore((state) => state.severityFilter);
  const showExternalFacts = useGraphStore((state) => state.showExternalFacts);
  const showExecutionRequiredFacts = useGraphStore((state) => state.showExecutionRequiredFacts);
  const setTacticFilter = useGraphStore((state) => state.setTacticFilter);
  const setSeverityFilter = useGraphStore((state) => state.setSeverityFilter);
  const setShowExternalFacts = useGraphStore((state) => state.setShowExternalFacts);
  const setShowExecutionRequiredFacts = useGraphStore((state) => state.setShowExecutionRequiredFacts);

  return (
    <div className="filter-group">
      <select value={tacticFilter} onChange={(event) => setTacticFilter(event.target.value)}>
        <option value="">All tactics</option>
        {ALLOWED_TACTICS.map((tactic) => (
          <option key={tactic} value={tactic}>
            {tactic}
          </option>
        ))}
      </select>
      <select value={severityFilter} onChange={(event) => setSeverityFilter(event.target.value as never)}>
        <option value="all">All severities</option>
        <option value="error">Errors</option>
        <option value="warning">Warnings</option>
        <option value="info">Info</option>
      </select>
      <label className="toggle">
        <input type="checkbox" checked={showExternalFacts} onChange={(event) => setShowExternalFacts(event.target.checked)} />
        External facts
      </label>
      <label className="toggle">
        <input type="checkbox" checked={showExecutionRequiredFacts} onChange={(event) => setShowExecutionRequiredFacts(event.target.checked)} />
        execution_required
      </label>
    </div>
  );
}
