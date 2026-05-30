import { FileUploadPanel } from "./FileUploadPanel";
import { FilterPanel } from "./FilterPanel";
import { SearchBox } from "./SearchBox";
import { useGraphStore } from "../store/graphStore";
import type { ViewMode } from "../types/graph";
import { exportJson, exportPng } from "../utils/exportUtils";

const viewModes: Array<{ value: ViewMode; label: string }> = [
  { value: "full", label: "Full Dependency" },
  { value: "attack", label: "Attack Flow" },
  { value: "focus", label: "Focus" },
  { value: "diagnostics", label: "Diagnostics" },
];

export function Toolbar() {
  const parsed = useGraphStore((state) => state.parsed);
  const cy = useGraphStore((state) => state.cy);
  const viewMode = useGraphStore((state) => state.viewMode);
  const setViewMode = useGraphStore((state) => state.setViewMode);
  const requestLayout = useGraphStore((state) => state.requestLayout);
  const requestFlowLayout = useGraphStore((state) => state.requestFlowLayout);
  const requestMitreFlowLayout = useGraphStore((state) => state.requestMitreFlowLayout);
  const requestFit = useGraphStore((state) => state.requestFit);
  const resetHighlight = useGraphStore((state) => state.resetHighlight);

  return (
    <header className="app-header">
      <div className="title-row">
        <div>
          <h1>Interactive CTI Dependency Hypergraph Viewer</h1>
        </div>
        <div className="action-row">
          <select value={viewMode} onChange={(event) => setViewMode(event.target.value as ViewMode)}>
            {viewModes.map((mode) => (
              <option key={mode.value} value={mode.value}>
                {mode.label}
              </option>
            ))}
          </select>
          <SearchBox />
          <button type="button" onClick={requestLayout}>
            Auto Layout
          </button>
          <button type="button" onClick={requestFlowLayout}>
            Auto Flow Layout
          </button>
          <button type="button" onClick={requestMitreFlowLayout}>
            MITRE Tactic Layout
          </button>
          <button type="button" onClick={requestFit}>
            Fit View
          </button>
          <button type="button" onClick={resetHighlight}>
            Reset
          </button>
          <button type="button" disabled={!parsed} onClick={() => parsed && exportJson(parsed)}>
            Export JSON
          </button>
          <button type="button" disabled={!cy} onClick={() => exportPng(cy)}>
            Export PNG
          </button>
        </div>
      </div>
      <FileUploadPanel />
      <FilterPanel />
    </header>
  );
}
