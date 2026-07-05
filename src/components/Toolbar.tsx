import { FilterPanel } from "./FilterPanel";
import { SearchBox } from "./SearchBox";
import { Icon } from "./icons";
import { useGraphStore } from "../store/graphStore";
import type { ViewMode } from "../types/graph";
import { exportPng } from "../utils/exportUtils";

const viewModes: Array<{ value: ViewMode; label: string }> = [
  { value: "full", label: "Full Dependency" },
  { value: "attack", label: "Attack Flow" },
];

export function Toolbar() {
  const cy = useGraphStore((state) => state.cy);
  const viewMode = useGraphStore((state) => state.viewMode);
  const setViewMode = useGraphStore((state) => state.setViewMode);
  const requestLayout = useGraphStore((state) => state.requestLayout);
  const requestFlowLayout = useGraphStore((state) => state.requestFlowLayout);
  const requestFit = useGraphStore((state) => state.requestFit);
  const showLegend = useGraphStore((state) => state.showLegend);
  const setShowLegend = useGraphStore((state) => state.setShowLegend);
  const magnifier = useGraphStore((state) => state.magnifier);
  const setMagnifier = useGraphStore((state) => state.setMagnifier);
  const resetView = useGraphStore((state) => state.resetView);

  return (
    <header className="app-header">
      <div className="title-row">
        <div className="action-row">
          <select value={viewMode} onChange={(event) => setViewMode(event.target.value as ViewMode)}>
            {viewModes.map((mode) => (
              <option key={mode.value} value={mode.value}>
                {mode.label}
              </option>
            ))}
          </select>
          <SearchBox />
          <button type="button" className="tb-btn" onClick={requestLayout} title="Auto-layout for the current view">
            <Icon name="grid" /> Auto Layout
          </button>
          <button type="button" className="tb-btn" onClick={requestFlowLayout} title="Flow-based layout">
            <Icon name="flow" /> Flow Layout
          </button>
          <button type="button" className="tb-btn" onClick={requestFit} title="Fit to screen">
            <Icon name="fit" /> Fit
          </button>
          <button type="button" className="tb-btn" onClick={resetView} title="Reset selection, search, and node positions">
            <Icon name="reset" /> Reset
          </button>
          <button type="button" className="tb-btn" onClick={() => setShowLegend(!showLegend)} title="Toggle legend">
            <Icon name="legend" /> Legend
          </button>
          <button
            type="button"
            className={`tb-btn${magnifier ? " active" : ""}`}
            onClick={() => setMagnifier(!magnifier)}
            title="Magnifier — hover over the graph to magnify the area under the cursor"
          >
            <Icon name="zoom" /> Magnifier
          </button>
          <button type="button" className="tb-btn" disabled={!cy} onClick={() => exportPng(cy)} title="Save graph as PNG">
            <Icon name="image" /> PNG
          </button>
        </div>
      </div>
      <FilterPanel />
    </header>
  );
}
