import type { RelationshipVerb, Tactic } from "../types/graph";

export const ALLOWED_TACTICS: Tactic[] = [
  "Reconnaissance",
  "Resource Development",
  "Initial Access",
  "Execution",
  "Persistence",
  "Privilege Escalation",
  "Defense Evasion",
  "Credential Access",
  "Discovery",
  "Lateral Movement",
  "Collection",
  "Command and Control",
  "Exfiltration",
  "Impact",
];

export const ALLOWED_OPERATORS = ["AND", "OR"] as const;
export const ALLOWED_IS_EXTERNAL = ["TRUE", "FALSE"] as const;
export const ALLOWED_LEVELS = ["report_explicit", "execution_required"] as const;

export const ALLOWED_RELATIONSHIP_VERBS: RelationshipVerb[] = [
  "enumerates",
  "creates",
  "transfers",
  "validates",
  "establishes",
  "updates",
  "executes",
  "loads",
  "masquerades",
  "transforms",
  "captures",
  "deobfuscates",
  "stages",
  "exfiltrates",
];
