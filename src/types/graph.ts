export type EntityId = string;

export type GraphEntityType = "node" | "fact" | "combine";

export type Tactic =
  | "Reconnaissance"
  | "Resource Development"
  | "Initial Access"
  | "Execution"
  | "Persistence"
  | "Privilege Escalation"
  | "Defense Evasion"
  | "Credential Access"
  | "Discovery"
  | "Lateral Movement"
  | "Collection"
  | "Command and Control"
  | "Exfiltration"
  | "Impact";

export type RelationshipVerb =
  | "enumerates"
  | "creates"
  | "transfers"
  | "validates"
  | "establishes"
  | "updates"
  | "executes"
  | "loads"
  | "masquerades"
  | "transforms"
  | "captures"
  | "deobfuscates"
  | "stages"
  | "exfiltrates";

export interface ParsedRelationship {
  raw: string;
  verb?: RelationshipVerb;
  source?: string;
  target?: string;
  isCanonical: boolean;
}

export interface AttackNode {
  id: string;
  type: "node";
  tactic: string;
  techniqueId: string;
  techniqueName: string;
  behaviorSummary: string;
  requirements: string[];
  relationships: ParsedRelationship[];
  parsers: string[];
  ref?: string;
  raw: Record<string, unknown>;
  rowIndex: number;
}

export interface Fact {
  id: string;
  type: "fact";
  name: string;
  producers: string[];
  consumers: string[];
  isExternalRaw: string;
  isExternal: boolean | null;
  level: string;
  description: string;
  ref?: string;
  raw: Record<string, unknown>;
  rowIndex: number;
}

export interface Combine {
  id: string;
  type: "combine";
  operator: "AND" | "OR" | string;
  members: string[];
  consumer: string[];
  label: string;
  raw: Record<string, unknown>;
  rowIndex: number;
}

export type DiagnosticSeverity = "error" | "warning" | "info";

export type DiagnosticType =
  | "header_mismatch"
  | "invalid_id"
  | "duplicate_id"
  | "invalid_tactic"
  | "invalid_operator"
  | "invalid_is_external"
  | "invalid_level"
  | "invalid_relationship_format"
  | "invalid_relationship_verb"
  | "missing_reference"
  | "wrong_reference_type"
  | "producer_parser_mismatch"
  | "requirement_consumer_mismatch"
  | "invalid_combine"
  | "combine_cycle"
  | "multi_requirement_without_combine"
  | "external_producer_conflict"
  | "internal_without_producer"
  | "unreachable_node"
  | "unproducible_fact"
  | "technique_gt_missing_in_answer"
  | "technique_gt_extra_in_answer"
  | "technique_name_mismatch";

export interface GraphDiagnostic {
  id: string;
  checkNo: "0" | "1" | "1b" | "2" | "3" | "3b" | "4" | "5" | "6" | "7";
  severity: DiagnosticSeverity;
  type: DiagnosticType;
  message: string;
  relatedIds: string[];
  rowRefs?: Array<{
    table: "node" | "fact" | "combine" | "gt";
    rowIndex: number;
    column?: string;
  }>;
  suggestedFix?: string;
}

export interface ParsedWorkbook {
  nodes: AttackNode[];
  facts: Fact[];
  combines: Combine[];
  diagnostics: GraphDiagnostic[];
  headerDiagnostics?: GraphDiagnostic[];
}

export interface GtTechnique {
  techniqueId: string;
  techniqueName: string;
  rowIndex: number;
}

export interface GtTable {
  techniques: GtTechnique[];
}

export type ViewMode = "full" | "attack" | "focus" | "diagnostics";

export interface GraphViewOptions {
  viewMode: ViewMode;
  selectedIds?: string[];
  searchTerm?: string;
  tacticFilter?: string;
  severityFilter?: DiagnosticSeverity | "all";
  showExternalFacts?: boolean;
  showExecutionRequiredFacts?: boolean;
}

export interface GraphEdgeData {
  id: string;
  source: string;
  target: string;
  edgeTypes: string[];
  label: string;
  displayLabel?: string;
  hoverLabel?: string;
}
