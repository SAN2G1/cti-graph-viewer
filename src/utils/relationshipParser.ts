import { ALLOWED_RELATIONSHIP_VERBS } from "../constants/allowedValues";
import type { ParsedRelationship, RelationshipVerb } from "../types/graph";
import { cellToString, normalizeFactId } from "./idParser";

const RELATIONSHIP_RE = /^\s*([a-zA-Z_]+)\s*\(\s*(F\d+[a-zA-Z]?|—|-)\s*(→|->)\s*(F\d+[a-zA-Z]?|—|-)\s*\)\s*$/;

export function parseRelationshipCell(cell: unknown): ParsedRelationship[] {
  const text = cellToString(cell);
  if (!text) return [];

  return text
    .split(/[,;\n]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map(parseRelationship);
}

export function parseRelationship(raw: string): ParsedRelationship {
  const match = RELATIONSHIP_RE.exec(raw);
  if (!match) {
    return { raw, isCanonical: false };
  }

  const verbText = match[1];
  const arrow = match[3];
  const source = normalizeRelationshipEndpoint(match[2]);
  const target = normalizeRelationshipEndpoint(match[4]);
  const verb = ALLOWED_RELATIONSHIP_VERBS.includes(verbText as RelationshipVerb)
    ? (verbText as RelationshipVerb)
    : undefined;

  return {
    raw,
    verb,
    source,
    target,
    isCanonical: arrow === "→",
  };
}

function normalizeRelationshipEndpoint(value: string): string {
  if (value === "—" || value === "-") return "—";
  return normalizeFactId(value);
}
