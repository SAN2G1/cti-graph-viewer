import { create } from "zustand";
import type cytoscape from "cytoscape";
import type { ParsedWorkbook, ViewMode } from "../types/graph";

interface GraphState {
  parsed: ParsedWorkbook | null;
  selectedIds: string[];
  viewMode: ViewMode;
  searchTerm: string;
  showExternalFacts: boolean;
  showLegend: boolean;
  cy: cytoscape.Core | null;
  layoutVersion: number;
  flowLayoutVersion: number;
  flowLayoutMode: "default" | "mitre";
  fitVersion: number;
  resetVersion: number;
  setParsed: (parsed: ParsedWorkbook | null) => void;
  setSelectedIds: (ids: string[]) => void;
  setViewMode: (viewMode: ViewMode) => void;
  setSearchTerm: (term: string) => void;
  setShowExternalFacts: (show: boolean) => void;
  setShowLegend: (show: boolean) => void;
  resetHighlight: () => void;
  resetView: () => void;
  setCy: (cy: cytoscape.Core | null) => void;
  requestLayout: () => void;
  requestFlowLayout: () => void;
  requestFit: () => void;
}

export const useGraphStore = create<GraphState>((set, get) => ({
  parsed: null,
  selectedIds: [],
  viewMode: "full",
  searchTerm: "",
  showExternalFacts: true,
  showLegend: true,
  cy: null,
  layoutVersion: 0,
  flowLayoutVersion: 0,
  flowLayoutMode: "default",
  fitVersion: 0,
  resetVersion: 0,
  setParsed: (parsed) => set({ parsed, selectedIds: [] }),
  setSelectedIds: (selectedIds) => set({ selectedIds }),
  setViewMode: (viewMode) => set({ viewMode }),
  setSearchTerm: (searchTerm) => set({ searchTerm }),
  setShowExternalFacts: (showExternalFacts) => set({ showExternalFacts }),
  setShowLegend: (showLegend) => set({ showLegend }),
  resetHighlight: () => set({ selectedIds: [], searchTerm: "" }),
  resetView: () =>
    set((state) => ({
      selectedIds: [],
      searchTerm: "",
      resetVersion: state.resetVersion + 1,
      layoutVersion: state.layoutVersion + 1,
    })),
  setCy: (cy) => set({ cy }),
  requestLayout: () => set({ layoutVersion: get().layoutVersion + 1 }),
  requestFlowLayout: () => set({ flowLayoutVersion: get().flowLayoutVersion + 1, flowLayoutMode: "default" }),
  requestFit: () => set({ fitVersion: get().fitVersion + 1 }),
}));
