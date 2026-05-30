export const NODE_HEADERS = [
  "node_id",
  "tactic",
  "technique_id",
  "technique_name",
  "behavior_summary",
  "requirements",
  "relationships",
  "parsers",
  "ref",
] as const;

export const FACT_HEADERS = [
  "fact_id",
  "name",
  "producers",
  "consumers",
  "is_external",
  "level",
  "description",
  "ref",
] as const;

export const COMBINE_HEADERS = [
  "combine_id",
  "operator",
  "members",
  "consumer",
  "label",
] as const;

export const GT_HEADERS_A = ["technique_id", "technique_name"] as const;
export const GT_HEADERS_B = ["unique_ids", "technique_name"] as const;

export type TableName = "node" | "fact" | "combine" | "gt";
