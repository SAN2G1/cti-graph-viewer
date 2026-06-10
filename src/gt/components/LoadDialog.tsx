import { useState } from "react";
import { useGtStore } from "../gtStore";
import { prepareViewerData } from "../prepareData";

type Slot = "node" | "fact" | "combine" | "pdf";

const FIELDS: Array<{ slot: Slot; label: string; hint: string; accept: string }> = [
  { slot: "node", label: "node.xlsx", hint: "Node (technique) table", accept: ".xlsx" },
  { slot: "fact", label: "fact.xlsx", hint: "Fact table", accept: ".xlsx" },
  { slot: "combine", label: "combine.xlsx", hint: "Combine table", accept: ".xlsx" },
  { slot: "pdf", label: "Report PDF", hint: "Original report (page text & images)", accept: ".pdf" },
];

export function LoadDialog({ onClose }: { onClose: () => void }) {
  const loadData = useGtStore((s) => s.loadData);
  const setPageImageMap = useGtStore((s) => s.setPageImageMap);

  const [files, setFiles] = useState<Partial<Record<Slot, File>>>({});
  const [pageOffset, setPageOffset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const ready = FIELDS.every((f) => files[f.slot]);

  const generate = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError("");
    try {
      const { data, images } = await prepareViewerData({
        nodeFile: files.node!,
        factFile: files.fact!,
        combineFile: files.combine!,
        pdfFile: files.pdf!,
        pageOffset,
        onProgress: setStatus,
      });
      loadData(data);
      setPageImageMap(images);
      onClose();
    } catch (err) {
      setError((err as Error)?.message || String(err));
      setStatus("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="load-dialog-backdrop" onMouseDown={() => !busy && onClose()}>
      <div className="load-dialog" onMouseDown={(e) => e.stopPropagation()}>
        <div className="load-dialog-head">
          <h3>Load data</h3>
          <p>Upload the three answer-sheet Excel files and the report PDF — the viewer builds its data automatically.</p>
        </div>

        <div className="load-dialog-fields">
          {FIELDS.map((f) => (
            <label key={f.slot} className={`load-field${files[f.slot] ? " filled" : ""}`}>
              <div className="load-field-text">
                <span className="load-field-label">{f.label}</span>
                <span className="load-field-hint">{files[f.slot]?.name || f.hint}</span>
              </div>
              <span className="load-field-action">{files[f.slot] ? "변경" : "선택"}</span>
              <input
                type="file"
                accept={f.accept}
                style={{ display: "none" }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) setFiles((prev) => ({ ...prev, [f.slot]: file }));
                  e.target.value = "";
                }}
              />
            </label>
          ))}
        </div>

        <div className="load-dialog-offset">
          <label htmlFor="page-offset">
            Page offset <span className="load-optional">optional</span>
          </label>
          <input
            id="page-offset"
            type="number"
            value={pageOffset}
            onChange={(e) => setPageOffset(parseInt(e.target.value, 10) || 0)}
          />
          <span className="load-field-hint">
            Leave at 0 in most cases. Only change it if the page numbers printed in the report don't match the
            actual PDF pages — e.g. if the PDF has a cover page so report page 1 is the 3rd PDF page, set this to 2.
          </span>
        </div>

        {error ? <div className="load-dialog-error">{error}</div> : null}

        <div className="load-dialog-foot">
          <span className="load-dialog-status">{busy ? status : ""}</span>
          <div className="load-dialog-buttons">
            <button type="button" className="btn-nav" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="button" className="btn-nav primary" onClick={generate} disabled={!ready || busy}>
              {busy ? "Processing…" : "Generate"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
