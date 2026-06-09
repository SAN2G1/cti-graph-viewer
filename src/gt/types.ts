// Type definitions for the GT-verifier data source (viewer_data.json).
// This is the single unified source: GT tabs render it directly, and the
// diagram tab derives a ParsedWorkbook from it (see viewerDataAdapter.ts).

export interface ViewerPage {
  page_number: number | string;
  text?: string;
}

export interface ViewerReqFact {
  type: "fact";
  name?: string;
  fact_id?: string;
  description?: string;
  inferred_flag?: boolean;
}

export interface ViewerReqCombine {
  type: "combine";
  operator?: string;
  label?: string;
  members?: ViewerReqItem[];
}

export type ViewerReqItem = ViewerReqFact | ViewerReqCombine;

export interface ViewerParser {
  name?: string;
  fact_id?: string;
  description?: string;
  inferred_flag?: boolean;
}

export interface ViewerNode {
  node_id: string;
  tactic?: string;
  technique_id?: string;
  technique_name?: string;
  behavior_summary?: string;
  report_pages?: ViewerPage[];
  requirements?: ViewerReqItem[];
  parsers?: ViewerParser[];
  relationships?: string;
}

export interface ViewerFact {
  fact_id: string;
  name?: string;
  description?: string;
  level?: string;
  is_external?: boolean | null;
  producers?: string[];
  consumers?: string[];
  inferred_flag?: boolean;
  report_pages?: ViewerPage[];
}

export interface ViewerCombine {
  combine_id: string;
  operator?: string;
  members?: string[] | string;
  consumer?: string;
  label?: string;
}

export interface ViewerData {
  nodes: ViewerNode[];
  facts: Record<string, ViewerFact>;
  combines?: ViewerCombine[];
}

export type GtTab = "nodes" | "facts" | "diagram";
export type ReportViewMode = "text" | "image";

// Shape of the exported / imported notes report.
export interface NoteReport {
  exported_at?: string;
  node_notes?: Array<{ node_id: string; note: string }>;
  fact_notes?: Array<{ fact_id: string; note: string }>;
}
