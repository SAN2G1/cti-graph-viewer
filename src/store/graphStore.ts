import { create } from "zustand";
import type cytoscape from "cytoscape";
import type { WorkBook } from "xlsx";
import type { DiagnosticSeverity, GraphDiagnostic, ParsedWorkbook, ViewMode } from "../types/graph";
import { parseUploadedWorkbooks, type UploadedTables } from "../utils/workbookParser";

interface GraphState {
  uploadedTables: UploadedTables;
  parsed: ParsedWorkbook | null;
  selectedIds: string[];
  selectedDiagnostic: GraphDiagnostic | null;
  viewMode: ViewMode;
  searchTerm: string;
  tacticFilter: string;
  severityFilter: DiagnosticSeverity | "all";
  showExternalFacts: boolean;
  showExecutionRequiredFacts: boolean;
  cy: cytoscape.Core | null;
  layoutVersion: number;
  flowLayoutVersion: number;
  flowLayoutMode: "default" | "mitre";
  fitVersion: number;
  setWorkbook: (kind: keyof UploadedTables, workbook: WorkBook) => void;
  setSelectedIds: (ids: string[]) => void;
  setSelectedDiagnostic: (diagnostic: GraphDiagnostic | null) => void;
  setViewMode: (viewMode: ViewMode) => void;
  setSearchTerm: (term: string) => void;
  setTacticFilter: (tactic: string) => void;
  setSeverityFilter: (severity: DiagnosticSeverity | "all") => void;
  setShowExternalFacts: (show: boolean) => void;
  setShowExecutionRequiredFacts: (show: boolean) => void;
  resetHighlight: () => void;
  setCy: (cy: cytoscape.Core | null) => void;
  requestLayout: () => void;
  requestFlowLayout: () => void;
  requestMitreFlowLayout: () => void;
  requestFit: () => void;
}

export const useGraphStore = create<GraphState>((set, get) => ({
  uploadedTables: {},
  parsed: null,
  selectedIds: [],
  selectedDiagnostic: null,
  viewMode: "full",
  searchTerm: "",
  tacticFilter: "",
  severityFilter: "all",
  showExternalFacts: true,
  showExecutionRequiredFacts: true,
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
    set({ selectedDiagnostic, selectedIds: selectedDiagnostic?.relatedIds ?? [] }),
  setViewMode: (viewMode) => set({ viewMode }),
  setSearchTerm: (searchTerm) => set({ searchTerm }),
  setTacticFilter: (tacticFilter) => set({ tacticFilter }),
  setSeverityFilter: (severityFilter) => set({ severityFilter }),
  setShowExternalFacts: (showExternalFacts) => set({ showExternalFacts }),
  setShowExecutionRequiredFacts: (showExecutionRequiredFacts) => set({ showExecutionRequiredFacts }),
  resetHighlight: () => set({ selectedIds: [], selectedDiagnostic: null, searchTerm: "" }),
  setCy: (cy) => set({ cy }),
  requestLayout: () => set({ layoutVersion: get().layoutVersion + 1 }),
  requestFlowLayout: () => set({ flowLayoutVersion: get().flowLayoutVersion + 1, flowLayoutMode: "default" }),
  requestMitreFlowLayout: () => set({ flowLayoutVersion: get().flowLayoutVersion + 1, flowLayoutMode: "mitre" }),
  requestFit: () => set({ fitVersion: get().fitVersion + 1 }),
}));
