export const NODE_ID_RE = /^N\d+$/;
export const FACT_ID_RE = /^F\d+[a-z]?$/;
export const COMBINE_ID_RE = /^C\d+$/;
export const TECHNIQUE_ID_RE = /^T\d+(\.\d+)?$/;

const ANY_ID_RE = /[Nn]\d+|[Ff]\d+[a-zA-Z]?|[Cc]\d+/g;

export function parseIdsFromCell(cell: unknown): string[] {
  const text = cellToString(cell);
  return [...text.matchAll(ANY_ID_RE)].map((match) => normalizeAnyId(match[0]));
}

export function parseNodeIdsFromCell(cell: unknown): string[] {
  return parseIdsFromCell(cell).filter((id) => id.startsWith("N"));
}

export function parseFactIdsFromCell(cell: unknown): string[] {
  return parseIdsFromCell(cell).filter((id) => id.startsWith("F"));
}

export function parseCombineIdsFromCell(cell: unknown): string[] {
  return parseIdsFromCell(cell).filter((id) => id.startsWith("C"));
}

export function normalizeNodeId(id: string): string {
  return id.trim().toUpperCase();
}

export function normalizeFactId(id: string): string {
  const value = id.trim();
  const match = /^f?(\d+)([a-zA-Z]?)$/i.exec(value.replace(/^F/i, ""));
  if (!match) return value.toUpperCase();
  return `F${match[1]}${match[2].toLowerCase()}`;
}

export function normalizeCombineId(id: string): string {
  return id.trim().toUpperCase();
}

export function normalizeTechniqueId(id: string): string {
  return id.trim().toUpperCase();
}

export function normalizeAnyId(id: string): string {
  const trimmed = id.trim();
  if (/^n/i.test(trimmed)) return normalizeNodeId(trimmed);
  if (/^f/i.test(trimmed)) return normalizeFactId(trimmed);
  if (/^c/i.test(trimmed)) return normalizeCombineId(trimmed);
  return trimmed;
}

export function classifyId(id: string): "node" | "fact" | "combine" | "unknown" {
  if (NODE_ID_RE.test(id)) return "node";
  if (FACT_ID_RE.test(id)) return "fact";
  if (COMBINE_ID_RE.test(id)) return "combine";
  return "unknown";
}

export function cellToString(cell: unknown): string {
  if (cell === null || cell === undefined) return "";
  if (typeof cell === "string") return cell.trim();
  if (typeof cell === "number" || typeof cell === "boolean") return String(cell).trim();
  return String(cell).trim();
}
