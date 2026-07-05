import { create } from "zustand";
import { useGraphStore } from "../store/graphStore";
import { viewerDataToParsedWorkbook } from "./viewerDataAdapter";
import type { GtTab, NoteReport, ReportViewMode, ViewerData } from "./types";
import type { ValidationResult } from "./validation";

function nodeNum(id: unknown): number {
  const match = String(id ?? "").match(/\d+/);
  return match ? parseInt(match[0], 10) : Number.MAX_SAFE_INTEGER;
}

interface GtState {
  data: ViewerData | null;
  activeTab: GtTab;
  nodeIndex: number;
  nodeNotes: Record<string, string>;
  factNotes: Record<string, string>;
  selectedFactId: string | null;
  reportViewMode: ReportViewMode;
  pageImageMap: Record<number, string>;
  validationResult: ValidationResult | null;
  helpOpen: boolean;

  loadData: (json: ViewerData, validationResult?: ValidationResult | null) => void;
  setActiveTab: (tab: GtTab) => void;
  setHelpOpen: (open: boolean) => void;
  navigateNode: (delta: number) => void;
  jumpToNode: (index: number) => void;
  setNodeNote: (note: string) => void;
  selectFact: (factId: string) => void;
  setFactNote: (factId: string, note: string) => void;
  setReportViewMode: (mode: ReportViewMode) => void;
  setPageImageMap: (map: Record<number, string>) => void;
  importNotes: (report: NoteReport) => string;
}

export const useGtStore = create<GtState>((set, get) => ({
  data: null,
  activeTab: "nodes",
  nodeIndex: 0,
  nodeNotes: {},
  factNotes: {},
  selectedFactId: null,
  reportViewMode: "text",
  pageImageMap: {},
  validationResult: null,
  helpOpen: false,

  loadData: (json, validationResult = null) => {
    const data: ViewerData = { ...json };

    if (Array.isArray(data.nodes)) {
      data.nodes = [...data.nodes].sort((a, b) => {
        const diff = nodeNum(a.node_id) - nodeNum(b.node_id);
        return diff !== 0 ? diff : String(a.node_id).localeCompare(String(b.node_id));
      });
    }

    // Feed the same dataset into the cytoscape graph viewer (diagram tab).
    try {
      useGraphStore.getState().setParsed(viewerDataToParsedWorkbook(data));
    } catch {
      useGraphStore.getState().setParsed(null);
    }

    set({
      data,
      nodeNotes: {},
      factNotes: {},
      nodeIndex: 0,
      selectedFactId: null,
      validationResult,
    });
  },

  setActiveTab: (activeTab) => set({ activeTab, helpOpen: false }),
  setHelpOpen: (helpOpen) => set({ helpOpen }),

  navigateNode: (delta) => {
    const { data, nodeIndex } = get();
    if (!data) return;
    const next = nodeIndex + delta;
    if (next < 0 || next >= data.nodes.length) return;
    set({ nodeIndex: next });
  },

  jumpToNode: (index) => {
    const { data } = get();
    if (!data || index < 0 || index >= data.nodes.length) return;
    set({ nodeIndex: index });
  },

  setNodeNote: (note) => {
    const { data, nodeIndex, nodeNotes } = get();
    if (!data) return;
    const node = data.nodes[nodeIndex];
    if (!node) return;
    set({ nodeNotes: { ...nodeNotes, [node.node_id]: note } });
  },

  selectFact: (selectedFactId) => set({ selectedFactId }),

  setFactNote: (factId, note) => {
    const { factNotes } = get();
    set({ factNotes: { ...factNotes, [factId]: note } });
  },

  setReportViewMode: (reportViewMode) => set({ reportViewMode }),
  setPageImageMap: (pageImageMap) => set({ pageImageMap }),

  importNotes: (report) => {
    const { data, nodeNotes, factNotes } = get();
    if (!data) return "Load data first, then import notes.";
    if (!Array.isArray(report.node_notes) && !Array.isArray(report.fact_notes)) {
      return "Unrecognized format. node_notes / fact_notes are required.";
    }

    const nextNodeNotes = { ...nodeNotes };
    const nextFactNotes = { ...factNotes };
    let nodeApplied = 0;
    let factApplied = 0;

    (report.node_notes || []).forEach((n) => {
      if (n && n.node_id != null && n.note) {
        nextNodeNotes[n.node_id] = n.note;
        nodeApplied += 1;
      }
    });
    (report.fact_notes || []).forEach((f) => {
      if (f && f.fact_id != null && f.note) {
        nextFactNotes[f.fact_id] = f.note;
        factApplied += 1;
      }
    });

    set({ nodeNotes: nextNodeNotes, factNotes: nextFactNotes });
    return `Import complete — applied ${nodeApplied} node notes and ${factApplied} fact notes`;
  },
}));

export function countNotes(notes: Record<string, string>): number {
  return Object.values(notes).filter((n) => n && n.trim()).length;
}
