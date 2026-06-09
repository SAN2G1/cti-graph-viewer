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

export interface ParsedWorkbook {
  nodes: AttackNode[];
  facts: Fact[];
  combines: Combine[];
}

export type ViewMode = "full" | "attack";

export interface GraphViewOptions {
  viewMode: ViewMode;
  searchTerm?: string;
  showExternalFacts?: boolean;
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
