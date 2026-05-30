import * as XLSX from "xlsx";
import { COMBINE_HEADERS, FACT_HEADERS, GT_HEADERS_A, GT_HEADERS_B, NODE_HEADERS } from "../constants/schema";
import type { AttackNode, Combine, Fact, GtTable, ParsedWorkbook } from "../types/graph";
import { cellToString, normalizeCombineId, normalizeFactId, normalizeNodeId, normalizeTechniqueId, parseIdsFromCell } from "./idParser";
import { parseRelationshipCell } from "./relationshipParser";
import { resetDiagnosticCounter, runAllDiagnostics, validateHeader } from "./diagnostics";

export type WorkbookTableKind = "node" | "fact" | "combine" | "gt";

export interface UploadedTables {
  node?: XLSX.WorkBook;
  fact?: XLSX.WorkBook;
  combine?: XLSX.WorkBook;
  combined?: XLSX.WorkBook;
  gt?: XLSX.WorkBook;
}

export async function readWorkbook(file: File): Promise<XLSX.WorkBook> {
  const buffer = await file.arrayBuffer();
  return XLSX.read(buffer, { type: "array", cellDates: false });
}

export function parseUploadedWorkbooks(tables: UploadedTables): ParsedWorkbook {
  const nodeSheet = findSheet(tables.combined, ["Node Table"]) ?? firstSheet(tables.node);
  const factSheet = findSheet(tables.combined, ["Fact Table"]) ?? firstSheet(tables.fact);
  const combineSheet = findSheet(tables.combined, ["Combine Table"]) ?? firstSheet(tables.combine);
  const gtSheet = findSheet(tables.combined, ["GT Table", "Ground Truth", "Technique GT"]) ?? firstSheet(tables.gt);

  const nodeRows = sheetToRows(nodeSheet);
  const factRows = sheetToRows(factSheet);
  const combineRows = sheetToRows(combineSheet);
  const gtRows = sheetToRows(gtSheet);

  resetDiagnosticCounter();
  const headerDiagnostics = [
    ...validateHeader("node", nodeRows.headers),
    ...validateHeader("fact", factRows.headers),
    ...validateHeader("combine", combineRows.headers),
  ];

  const parsedWithoutDiagnostics: ParsedWorkbook = {
    nodes: parseNodeRows(nodeRows.rows),
    facts: parseFactRows(factRows.rows),
    combines: parseCombineRows(combineRows.rows),
    diagnostics: [],
    headerDiagnostics,
  };
  const gt = parseGtRows(gtRows.rows, gtRows.headers);

  return {
    ...parsedWithoutDiagnostics,
    diagnostics: runAllDiagnostics(parsedWithoutDiagnostics, gt),
  };
}

function parseNodeRows(rows: Array<Record<string, unknown>>): AttackNode[] {
  return rows.map((row, index) => ({
    id: normalizeNodeId(cellToString(row.node_id)),
    type: "node",
    tactic: cellToString(row.tactic),
    techniqueId: normalizeTechniqueId(cellToString(row.technique_id)),
    techniqueName: cellToString(row.technique_name),
    behaviorSummary: cellToString(row.behavior_summary),
    requirements: parseIdsFromCell(row.requirements).filter((id) => id.startsWith("F") || id.startsWith("C")),
    relationships: parseRelationshipCell(row.relationships),
    parsers: parseIdsFromCell(row.parsers).filter((id) => id.startsWith("F")),
    ref: cellToString(row.ref),
    raw: row,
    rowIndex: index + 2,
  }));
}

function parseFactRows(rows: Array<Record<string, unknown>>): Fact[] {
  return rows.map((row, index) => {
    const isExternalRaw = cellToString(row.is_external).toUpperCase();
    return {
      id: normalizeFactId(cellToString(row.fact_id)),
      type: "fact",
      name: cellToString(row.name),
      producers: parseIdsFromCell(row.producers).filter((id) => id.startsWith("N")),
      consumers: parseIdsFromCell(row.consumers).filter((id) => id.startsWith("N")),
      isExternalRaw,
      isExternal: isExternalRaw === "TRUE" ? true : isExternalRaw === "FALSE" ? false : null,
      level: cellToString(row.level),
      description: cellToString(row.description),
      ref: cellToString(row.ref),
      raw: row,
      rowIndex: index + 2,
    };
  });
}

function parseCombineRows(rows: Array<Record<string, unknown>>): Combine[] {
  return rows.map((row, index) => ({
    id: normalizeCombineId(cellToString(row.combine_id)),
    type: "combine",
    operator: cellToString(row.operator).toUpperCase(),
    members: parseIdsFromCell(row.members).filter((id) => id.startsWith("F") || id.startsWith("C")),
    consumer: parseIdsFromCell(row.consumer).filter((id) => id.startsWith("N") || id.startsWith("C")),
    label: cellToString(row.label),
    raw: row,
    rowIndex: index + 2,
  }));
}

function parseGtRows(rows: Array<Record<string, unknown>>, headers: string[]): GtTable | undefined {
  if (rows.length === 0) return undefined;
  const hasA = GT_HEADERS_A.every((header) => headers.includes(header));
  const hasB = GT_HEADERS_B.every((header) => headers.includes(header));
  if (!hasA && !hasB) return undefined;
  const idColumn = hasA ? "technique_id" : "unique_ids";
  return {
    techniques: rows
      .map((row, index) => ({
        techniqueId: normalizeTechniqueId(cellToString(row[idColumn])),
        techniqueName: cellToString(row.technique_name),
        rowIndex: index + 2,
      }))
      .filter((technique) => technique.techniqueId),
  };
}

function findSheet(workbook: XLSX.WorkBook | undefined, names: string[]): XLSX.WorkSheet | undefined {
  if (!workbook) return undefined;
  const normalized = new Map(workbook.SheetNames.map((name) => [name.trim().toLowerCase(), name]));
  for (const name of names) {
    const actualName = normalized.get(name.toLowerCase());
    if (actualName) return workbook.Sheets[actualName];
  }
  return undefined;
}

function firstSheet(workbook: XLSX.WorkBook | undefined): XLSX.WorkSheet | undefined {
  if (!workbook) return undefined;
  return workbook.Sheets[workbook.SheetNames[0]];
}

function sheetToRows(sheet: XLSX.WorkSheet | undefined): { headers: string[]; rows: Array<Record<string, unknown>> } {
  if (!sheet) return { headers: [], rows: [] };
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
  const headers = (matrix[0] ?? []).map((header) => cellToString(header).replace(/\s+/g, " ").trim());
  const rows = matrix.slice(1).filter((row) => row.some((cell) => cellToString(cell))).map((row) => {
    const record: Record<string, unknown> = {};
    headers.forEach((header, index) => {
      record[header] = row[index] ?? "";
    });
    return record;
  });
  return { headers, rows };
}

export const expectedHeaders = {
  node: NODE_HEADERS,
  fact: FACT_HEADERS,
  combine: COMBINE_HEADERS,
};
