import { create } from "zustand";
import type cytoscape from "cytoscape";
import type { WorkBook } from "xlsx";
import type { DiagnosticSeverity, GraphDiagnostic, ParsedWorkbook, ViewMode } from "../types/graph";
import { parseUploadedWorkbooks, type UploadedTables } from "../utils/workbookParser";

type AppScreen = "viewer" | "help";

interface GraphState {
  uploadedTables: UploadedTables;
  parsed: ParsedWorkbook | null;
  selectedIds: string[];
  selectedDiagnostic: GraphDiagnostic | null;
  screen: AppScreen;
  viewMode: ViewMode;
  searchTerm: string;
  tacticFilter: string;
  severityFilter: DiagnosticSeverity | "all";
  showExternalFacts: boolean;
  showExecutionRequiredFacts: boolean;
  showLegend: boolean;
  cy: cytoscape.Core | null;
  layoutVersion: number;
  flowLayoutVersion: number;
  flowLayoutMode: "default" | "mitre";
  fitVersion: number;
  setWorkbook: (kind: keyof UploadedTables, workbook: WorkBook) => void;
  setSelectedIds: (ids: string[]) => void;
  setSelectedDiagnostic: (diagnostic: GraphDiagnostic | null) => void;
  setScreen: (screen: AppScreen) => void;
  setViewMode: (viewMode: ViewMode) => void;
  setSearchTerm: (term: string) => void;
  setTacticFilter: (tactic: string) => void;
  setSeverityFilter: (severity: DiagnosticSeverity | "all") => void;
  setShowExternalFacts: (show: boolean) => void;
  setShowExecutionRequiredFacts: (show: boolean) => void;
  setShowLegend: (show: boolean) => void;
  resetHighlight: () => void;
  setCy: (cy: cytoscape.Core | null) => void;
  requestLayout: () => void;
  requestFlowLayout: () => void;
  requestFit: () => void;
}

export const useGraphStore = create<GraphState>((set, get) => ({
  uploadedTables: {},
  parsed: null,
  selectedIds: [],
  selectedDiagnostic: null,
  screen: "viewer",
  viewMode: "full",
  searchTerm: "",
  tacticFilter: "",
  severityFilter: "all",
  showExternalFacts: true,
  showExecutionRequiredFacts: true,
  showLegend: true,
  cy: null,
  layoutVersion: 0,
  flowLayoutVersion: 0,
  flowLayoutMode: "default",
  fitVersion: 0,
  setWorkbook: (kind, workbook) => {
    const uploadedTables = { ...get().uploadedTables, [kind]: workbook };
    const parsed = parseUploadedWorkbooks(uploadedTables);
    set({ uploadedTables, parsed, selectedIds: [], selectedDiagnostic: null });
  },
  setSelectedIds: (selectedIds) => set({ selectedIds, selectedDiagnostic: null }),
  setSelectedDiagnostic: (selectedDiagnostic) =>
    set({
      selectedDiagnostic,
      selectedIds: selectedDiagnostic?.relatedIds ?? [],
      viewMode: selectedDiagnostic ? "diagnostics" : get().viewMode,
    }),
  setScreen: (screen) => set({ screen }),
  setViewMode: (viewMode) => set({ viewMode }),
  setSearchTerm: (searchTerm) => set({ searchTerm }),
  setTacticFilter: (tacticFilter) => set({ tacticFilter }),
  setSeverityFilter: (severityFilter) => set({ severityFilter }),
  setShowExternalFacts: (showExternalFacts) => set({ showExternalFacts }),
  setShowExecutionRequiredFacts: (showExecutionRequiredFacts) => set({ showExecutionRequiredFacts }),
  setShowLegend: (showLegend) => set({ showLegend }),
  resetHighlight: () => set({ selectedIds: [], selectedDiagnostic: null, searchTerm: "" }),
  setCy: (cy) => set({ cy }),
  requestLayout: () => set({ layoutVersion: get().layoutVersion + 1 }),
  requestFlowLayout: () => set({ flowLayoutVersion: get().flowLayoutVersion + 1, flowLayoutMode: "default" }),
  requestFit: () => set({ fitVersion: get().fitVersion + 1 }),
}));
