import { useGtStore } from "../gtStore";
import { exportNotesCsv, exportNotesJson } from "../exportNotes";
import type { NoteReport, ViewerData } from "../types";
import { Icon } from "../../components/icons";

export function TopBar() {
  const data = useGtStore((s) => s.data);
  const nodeNotes = useGtStore((s) => s.nodeNotes);
  const factNotes = useGtStore((s) => s.factNotes);
  const reportViewMode = useGtStore((s) => s.reportViewMode);
  const pageImageMap = useGtStore((s) => s.pageImageMap);
  const loadData = useGtStore((s) => s.loadData);
  const setLoadError = useGtStore((s) => s.setLoadError);
  const setPageImageMap = useGtStore((s) => s.setPageImageMap);
  const importNotes = useGtStore((s) => s.importNotes);
  const helpOpen = useGtStore((s) => s.helpOpen);
  const setHelpOpen = useGtStore((s) => s.setHelpOpen);

  const nodeCount = data?.nodes.length ?? 0;
  const factCount = data ? Object.keys(data.facts || {}).length : 0;
  const imageCount = Object.keys(pageImageMap).length;

  const handleDataFile = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        loadData(JSON.parse(String(ev.target?.result)) as ViewerData);
      } catch (err) {
        setLoadError("JSON 파싱 오류: " + (err as Error).message);
      }
    };
    reader.readAsText(file);
  };

  const handleImgFolder = (files: FileList | null) => {
    if (!files) return;
    const map: Record<number, string> = {};
    Array.from(files).forEach((f) => {
      const m = f.name.match(/page_(\d+)\.(jpe?g|png|webp)$/i);
      if (m) map[parseInt(m[1], 10)] = URL.createObjectURL(f);
    });
    setPageImageMap(map);
  };

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
    <div id="topbar">
      <span className="topbar-brand">CTI Graph Viewer</span>
      <div className="topbar-sep" />
      <span className="topbar-meta">
        {data ? `${nodeCount} nodes · ${factCount} facts` : "no data"}
      </span>
      <div className="topbar-spacer" />

      <label className="btn-icon" title="데이터 파일(viewer_data.json) 불러오기">
        <Icon name="load" />
        <span>Load</span>
        <input
          type="file"
          accept=".json"
          style={{ display: "none" }}
          onChange={(e) => {
            handleDataFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </label>

      {reportViewMode === "image" || imageCount > 0 ? (
        <label className={`btn-icon${imageCount > 0 ? " on" : ""}`} title="보고서 페이지 이미지 폴더 선택">
          <Icon name="image" />
          <span>{imageCount > 0 ? `${imageCount} imgs` : "Images"}</span>
          <input
            type="file"
            multiple
            accept="image/*"
            // @ts-expect-error non-standard directory upload attribute
            webkitdirectory=""
            style={{ display: "none" }}
            onChange={(e) => handleImgFolder(e.target.files)}
          />
        </label>
      ) : null}

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
  );
}
