import type { ViewerData } from "./types";

function datestamp(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, "");
}

function downloadFile(name: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function csvCell(value: unknown): string {
  const s = String(value == null ? "" : value);
  if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export function exportNotesJson(
  data: ViewerData,
  nodeNotes: Record<string, string>,
  factNotes: Record<string, string>,
): void {
  const payload = {
    exported_at: new Date().toISOString(),
    node_notes: Object.entries(nodeNotes)
      .filter(([, note]) => note && note.trim())
      .map(([node_id, note]) => ({ node_id, note })),
    fact_notes: Object.entries(factNotes)
      .filter(([, note]) => note && note.trim())
      .map(([fact_id, note]) => ({ fact_id, note })),
  };
  downloadFile("notes_" + datestamp() + ".json", JSON.stringify(payload, null, 2), "application/json");
}

export function exportNotesCsv(data: ViewerData, nodeNotes: Record<string, string>): void {
  const header = ["node_id", "tactic", "technique_id", "technique_name", "note"];
  const rows = data.nodes.map((n) =>
    [n.node_id, n.tactic, n.technique_id, n.technique_name, nodeNotes[n.node_id] || ""].map(csvCell),
  );
  const csv = [header, ...rows].map((r) => r.join(",")).join("\r\n");
  downloadFile("notes_" + datestamp() + ".csv", csv, "text/csv");
}
