// Builds viewer data from node/fact/combine Excel files and the report PDF.

import * as XLSX from "xlsx";
import * as pdfjsLib from "pdfjs-dist";
import PdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type {
  ViewerCombine,
  ViewerData,
  ViewerFact,
  ViewerNode,
  ViewerPage,
  ViewerParser,
  ViewerReqItem,
} from "./types";
import {
  parseBooleanCell,
  validateWorkbookDataRows,
  validateWorkbookHeaders,
  validateWorkbookRows,
  type ValidationIssue,
  type WorkbookSheetKind,
} from "./validation";

pdfjsLib.GlobalWorkerOptions.workerSrc = PdfWorkerUrl;

type Row = Record<string, string>;

interface ParsedSheet {
  rows: Row[];
  workbookIssues: ValidationIssue[];
}

export interface PrepareInput {
  nodeFile: File;
  factFile: File;
  combineFile: File;
  pdfFile: File;
  pageOffset: number;
  onProgress?: (message: string) => void;
}

export interface PrepareResult {
  data: ViewerData;
  images: Record<number, string>;
  workbookIssues: ValidationIssue[];
}

function splitIds(raw: string | undefined): string[] {
  if (!raw || !raw.trim()) return [];
  return raw
    .trim()
    .split(/[,;]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function parseBool(value: string | undefined): boolean {
  return parseBooleanCell(value) ?? false;
}

function trailingInt(token: string): number | null {
  const m = token.trim().match(/(\d+)$/);
  return m ? parseInt(m[1], 10) : null;
}

function refTokens(raw: string | undefined): string[] {
  if (!raw || !raw.trim()) return [];
  return raw.trim().split(/[,\s;·]+/).filter(Boolean);
}

async function parseSheet(file: File, kind: WorkbookSheetKind): Promise<ParsedSheet> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(new Uint8Array(buf), { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return { rows: [], workbookIssues: validateWorkbookHeaders(kind, file.name, []) };
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: "" });
  if (!aoa.length) return { rows: [], workbookIssues: validateWorkbookHeaders(kind, file.name, []) };
  const headers = (aoa[0] as unknown[]).map((h) => String(h ?? "").trim().toLowerCase());
  const workbookIssues = validateWorkbookHeaders(kind, file.name, headers);
  const rows: Row[] = [];
  for (const raw of aoa.slice(1)) {
    const cells = raw as unknown[];
    if (cells.every((c) => c == null || String(c).trim() === "")) continue;
    const dict: Row = {};
    headers.forEach((h, i) => {
      dict[h] = cells[i] == null ? "" : String(cells[i]).trim();
    });
    rows.push(dict);
  }
  return { rows, workbookIssues: [...workbookIssues, ...validateWorkbookRows(kind, file.name, rows)] };
}

type PdfDoc = Awaited<ReturnType<typeof pdfjsLib.getDocument>["promise"]>;

async function openPdf(file: File): Promise<PdfDoc> {
  const buf = await file.arrayBuffer();
  return pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
}

// printed = physical - pageOffset. Returns {printed page number → text}.
async function extractPdfText(pdf: PdfDoc, pageOffset: number): Promise<Map<number, string>> {
  const pages = new Map<number, string>();
  for (let i = 0; i < pdf.numPages; i++) {
    const printed = i + 1 - pageOffset;
    if (printed < 1) continue;
    const page = await pdf.getPage(i + 1);
    const content = await page.getTextContent();
    const lines: string[] = [];
    let line = "";
    for (const item of content.items) {
      if (!("str" in item)) continue;
      line += item.str;
      if (item.hasEOL) {
        lines.push(line);
        line = "";
      }
    }
    if (line) lines.push(line);
    pages.set(printed, lines.join("\n"));
  }
  return pages;
}

// physical_0based = printed + pageOffset - 1
async function renderPageImages(
  pdf: PdfDoc,
  printedPages: number[],
  pageOffset: number,
): Promise<Record<number, string>> {
  const images: Record<number, string> = {};
  const scale = 150 / 72; // ~150 DPI
  for (const printed of [...printedPages].sort((a, b) => a - b)) {
    const physicalIdx = printed + pageOffset - 1;
    if (physicalIdx < 0 || physicalIdx >= pdf.numPages) continue;
    const page = await pdf.getPage(physicalIdx + 1);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.85),
    );
    if (blob) images[printed] = URL.createObjectURL(blob);
  }
  return images;
}

interface FactInternal extends ViewerFact {
  is_external: boolean;
}

function pagesFor(numbers: Iterable<number>, reportPages: Map<number, string>): ViewerPage[] {
  const out: ViewerPage[] = [];
  for (const pn of [...new Set(numbers)].sort((a, b) => a - b)) {
    const text = reportPages.get(pn);
    if (text !== undefined) out.push({ page_number: pn, text });
  }
  return out;
}

function expandRequirement(
  refId: string,
  factsMap: Map<string, FactInternal>,
  combineMap: Map<string, ViewerCombine & { member_ids: string[] }>,
  visited: Set<string>,
  depth: number,
): ViewerReqItem | null {
  if (depth >= 10 || visited.has(refId)) return null;
  const next = new Set(visited).add(refId);
  const upper = refId.toUpperCase();
  if (upper.startsWith("F")) {
    const fact = factsMap.get(refId);
    if (!fact) return null;
    return {
      type: "fact",
      fact_id: fact.fact_id,
      name: fact.name,
      description: fact.description,
      inferred_flag: fact.inferred_flag,
    };
  }
  if (upper.startsWith("C")) {
    const combine = combineMap.get(refId);
    if (!combine) return null;
    const members: ViewerReqItem[] = [];
    for (const mid of combine.member_ids) {
      const item = expandRequirement(mid, factsMap, combineMap, next, depth + 1);
      if (item) members.push(item);
    }
    return { type: "combine", operator: combine.operator, label: combine.label, members };
  }
  return null;
}

function resolveParser(
  token: string,
  factsMap: Map<string, FactInternal>,
  factsByName: Map<string, FactInternal>,
): ViewerParser | null {
  const fact = factsMap.get(token) || factsByName.get(token);
  if (!fact) return null;
  return { fact_id: fact.fact_id, name: fact.name, description: fact.description };
}

function buildViewerData(
  nodeRows: Row[],
  factRows: Row[],
  combineRows: Row[],
  reportPages: Map<number, string>,
): { data: ViewerData; referencedPages: Set<number> } {
  const factsMap = new Map<string, FactInternal>();
  const factsByName = new Map<string, FactInternal>();
  for (const row of factRows) {
    const fid = (row.fact_id || "").trim();
    if (!fid) continue;
    const name = (row.name || "").trim();
    const level = (row.level || "").trim();
    const fact: FactInternal = {
      fact_id: fid,
      name,
      description: (row.description || "").trim(),
      is_external: parseBool(row.is_external),
      level,
      inferred_flag: level !== "report_explicit",
      report_pages: [],
      producers: splitIds(row.producers),
      consumers: splitIds(row.consumers),
    };
    factsMap.set(fid, fact);
    if (name) factsByName.set(name, fact);
  }

  const combineMap = new Map<string, ViewerCombine & { member_ids: string[] }>();
  for (const row of combineRows) {
    const cid = (row.combine_id || "").trim();
    if (!cid) continue;
    const member_ids = splitIds(row.members);
    combineMap.set(cid, {
      combine_id: cid,
      operator: (row.operator || "AND").trim(),
      label: (row.label || "").trim(),
      consumer: (row.consumer || "").trim(),
      members: member_ids,
      member_ids,
    });
  }

  const nodeRefRaw = new Map<string, string>();
  for (const row of nodeRows) {
    const nid = (row.node_id || "").trim();
    if (nid) nodeRefRaw.set(nid, (row.ref || "").trim());
  }

  for (const fact of factsMap.values()) {
    const numbers = new Set<number>();
    for (const nid of new Set([...(fact.producers || []), ...(fact.consumers || [])])) {
      for (const tok of refTokens(nodeRefRaw.get(nid))) {
        const pn = trailingInt(tok);
        if (pn != null) numbers.add(pn);
      }
    }
    fact.report_pages = pagesFor(numbers, reportPages);
  }

  const nodes: ViewerNode[] = [];
  for (const row of nodeRows) {
    const nid = (row.node_id || "").trim();
    if (!nid) continue;
    const requirements: ViewerReqItem[] = [];
    for (const rid of splitIds(row.requirements)) {
      const item = expandRequirement(rid, factsMap, combineMap, new Set(), 0);
      if (item) requirements.push(item);
    }
    const parsers: ViewerParser[] = [];
    for (const tok of splitIds(row.parsers)) {
      const p = resolveParser(tok, factsMap, factsByName);
      if (p) parsers.push(p);
    }
    const refNumbers = new Set<number>();
    for (const tok of refTokens(row.ref)) {
      const pn = trailingInt(tok);
      if (pn != null) refNumbers.add(pn);
    }
    nodes.push({
      node_id: nid,
      tactic: (row.tactic || "").trim(),
      technique_id: (row.technique_id || "").trim(),
      technique_name: (row.technique_name || "").trim(),
      behavior_summary: (row.behavior_summary || "").trim(),
      relationships: (row.relationships || "").trim(),
      report_pages: pagesFor(refNumbers, reportPages),
      requirements,
      parsers,
    });
  }

  const facts: Record<string, ViewerFact> = {};
  for (const fid of [...factsMap.keys()].sort()) {
    const f = factsMap.get(fid)!;
    facts[fid] = {
      fact_id: f.fact_id,
      name: f.name,
      description: f.description,
      is_external: f.is_external,
      level: f.level,
      inferred_flag: f.inferred_flag,
      report_pages: f.report_pages,
      producers: [...(f.producers || [])].sort(),
      consumers: [...(f.consumers || [])].sort(),
    };
  }

  const combines: ViewerCombine[] = [...combineMap.values()].map((c) => ({
    combine_id: c.combine_id,
    operator: c.operator,
    label: c.label,
    consumer: c.consumer,
    members: c.members,
  }));

  const referencedPages = new Set<number>();
  for (const node of nodes)
    for (const p of node.report_pages || []) referencedPages.add(Number(p.page_number));
  for (const fact of Object.values(facts))
    for (const p of fact.report_pages || []) referencedPages.add(Number(p.page_number));

  return { data: { nodes, facts, combines }, referencedPages };
}

export async function prepareViewerData(input: PrepareInput): Promise<PrepareResult> {
  const { nodeFile, factFile, combineFile, pdfFile, pageOffset, onProgress } = input;
  const progress = onProgress ?? (() => {});

  progress("Reading Excel files…");
  const [nodeSheet, factSheet, combineSheet] = await Promise.all([
    parseSheet(nodeFile, "node"),
    parseSheet(factFile, "fact"),
    parseSheet(combineFile, "combine"),
  ]);
  const workbookIssues = [
    ...nodeSheet.workbookIssues,
    ...factSheet.workbookIssues,
    ...combineSheet.workbookIssues,
    ...validateWorkbookDataRows({
      nodeRows: nodeSheet.rows,
      factRows: factSheet.rows,
      combineRows: combineSheet.rows,
    }),
  ];

  progress("Extracting PDF text…");
  const pdf = await openPdf(pdfFile);
  const reportPages = await extractPdfText(pdf, pageOffset);

  progress("Building viewer data…");
  const { data, referencedPages } = buildViewerData(nodeSheet.rows, factSheet.rows, combineSheet.rows, reportPages);

  progress(`Rendering page images… (${referencedPages.size})`);
  const images = await renderPageImages(pdf, [...referencedPages], pageOffset);

  return { data, images, workbookIssues };
}
