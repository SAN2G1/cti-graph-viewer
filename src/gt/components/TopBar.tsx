import { useState } from "react";
import { useGtStore } from "../gtStore";
import { exportNotesCsv, exportNotesJson } from "../exportNotes";
import type { NoteReport } from "../types";
import { Icon } from "../../components/icons";
import { LoadDialog } from "./LoadDialog";

export function TopBar() {
  const data = useGtStore((s) => s.data);
  const nodeNotes = useGtStore((s) => s.nodeNotes);
  const factNotes = useGtStore((s) => s.factNotes);
  const importNotes = useGtStore((s) => s.importNotes);
  const helpOpen = useGtStore((s) => s.helpOpen);
  const setHelpOpen = useGtStore((s) => s.setHelpOpen);

  const [loadOpen, setLoadOpen] = useState(false);

  const nodeCount = data?.nodes.length ?? 0;
  const factCount = data ? Object.keys(data.facts || {}).length : 0;

  const handleImportFile = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        window.alert(importNotes(JSON.parse(String(ev.target?.result)) as NoteReport));
      } catch (err) {
        window.alert("JSON 파싱 오류: " + (err as Error).message);
      }
    };
    reader.readAsText(file);
  };

  return (
    <>
    <div id="topbar">
      <span className="topbar-brand">CTI Graph Viewer</span>
      <div className="topbar-sep" />
      <span className="topbar-meta">
        {data ? `${nodeCount} nodes · ${factCount} facts` : "no data"}
      </span>
      <div className="topbar-spacer" />

      <button type="button" className="btn-icon" title="Excel 3개 + 보고서 PDF로 데이터 생성" onClick={() => setLoadOpen(true)}>
        <Icon name="load" />
        <span>Load</span>
      </button>

      <div className="topbar-sep" />

      <label className="btn-icon" title="메모 가져오기 (JSON)">
        <Icon name="import" />
        <span>Import</span>
        <input
          type="file"
          accept=".json"
          style={{ display: "none" }}
          onChange={(e) => {
            handleImportFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </label>
      <button
        type="button"
        className="btn-icon"
        disabled={!data}
        title="메모 JSON 저장"
        onClick={() => data && exportNotesJson(data, nodeNotes, factNotes)}
      >
        <Icon name="save" />
        <span>JSON</span>
      </button>
      <button
        type="button"
        className="btn-icon"
        disabled={!data}
        title="메모 CSV 저장"
        onClick={() => data && exportNotesCsv(data, nodeNotes)}
      >
        <Icon name="save" />
        <span>CSV</span>
      </button>

      <div className="topbar-sep" />
      <button
        type="button"
        className={`btn-icon${helpOpen ? " active" : ""}`}
        onClick={() => setHelpOpen(!helpOpen)}
        title="사용 안내"
      >
        <Icon name="help" />
      </button>
    </div>
    {loadOpen ? <LoadDialog onClose={() => setLoadOpen(false)} /> : null}
    </>
  );
}
