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
          <button type="button" className="tb-btn" onClick={requestLayout} title="현재 뷰 기준 자동 배치">
            <Icon name="grid" /> Auto Layout
          </button>
          <button type="button" className="tb-btn" onClick={requestFlowLayout} title="흐름 기준 배치">
            <Icon name="flow" /> Flow Layout
          </button>
          <button type="button" className="tb-btn" onClick={requestFit} title="화면에 맞춤">
            <Icon name="fit" /> Fit
          </button>
          <button type="button" className="tb-btn" onClick={resetView} title="Reset selection, search, and node positions">
            <Icon name="reset" /> Reset
          </button>
          <button type="button" className="tb-btn" onClick={() => setShowLegend(!showLegend)} title="범례 표시 전환">
            <Icon name="legend" /> Legend
          </button>
          <button type="button" className="tb-btn" disabled={!cy} onClick={() => exportPng(cy)} title="그래프 PNG 저장">
            <Icon name="image" /> PNG
          </button>
        </div>
      </div>
      <FilterPanel />
    </header>
  );
}
