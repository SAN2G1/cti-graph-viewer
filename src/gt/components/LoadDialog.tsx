import { useState } from "react";
import { useGtStore } from "../gtStore";
import { prepareViewerData } from "../prepareData";
import type { ViewerData } from "../types";
import { summarizeValidationIssues, validateViewerData, type ValidationResult } from "../validation";

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
  const [validationResult, setLocalValidationResult] = useState<ValidationResult | null>(null);
  const [pendingLoad, setPendingLoad] = useState<{
    data: ViewerData;
    images: Record<number, string>;
    validationResult: ValidationResult;
  } | null>(null);

  const ready = FIELDS.every((f) => files[f.slot]);

  const commitLoad = (
    data: ViewerData,
    images: Record<number, string>,
    result: ValidationResult,
  ) => {
    loadData(data, result);
    setPageImageMap(images);
    onClose();
  };

  const generate = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError("");
    setLocalValidationResult(null);
    setPendingLoad(null);
    try {
      const { data, images, workbookIssues } = await prepareViewerData({
        nodeFile: files.node!,
        factFile: files.fact!,
        combineFile: files.combine!,
        pdfFile: files.pdf!,
        pageOffset,
        onProgress: setStatus,
      });
      const dataResult = validateViewerData(data);
      const issues = [...workbookIssues, ...dataResult.issues];
      const result: ValidationResult = {
        issues,
        summary: summarizeValidationIssues(issues),
      };
      setLocalValidationResult(result);
      if (result.summary.errors > 0) {
        setPendingLoad({ data, images, validationResult: result });
        setStatus("");
        return;
      }
      commitLoad(data, images, result);
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
          <p>Upload node/fact/combine Excel files and the report PDF.</p>
        </div>

        <div className="load-dialog-fields">
          {FIELDS.map((f) => (
            <label key={f.slot} className={`load-field${files[f.slot] ? " filled" : ""}`}>
              <div className="load-field-text">
                <span className="load-field-label">{f.label}</span>
                <span className="load-field-hint">{files[f.slot]?.name || f.hint}</span>
              </div>
              <span className="load-field-action">{files[f.slot] ? "Change" : "Select"}</span>
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
            Use 0 unless printed report pages differ from physical PDF pages.
          </span>
        </div>

        {error ? <div className="load-dialog-error">{error}</div> : null}
        {validationResult ? <ValidationSummary result={validationResult} /> : null}

        <div className="load-dialog-foot">
          <span className="load-dialog-status">{busy ? status : ""}</span>
          <div className="load-dialog-buttons">
            <button type="button" className="btn-nav" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            {pendingLoad ? (
              <button
                type="button"
                className="btn-nav primary"
                onClick={() => commitLoad(pendingLoad.data, pendingLoad.images, pendingLoad.validationResult)}
              >
                Load anyway
              </button>
            ) : (
              <button type="button" className="btn-nav primary" onClick={generate} disabled={!ready || busy}>
                {busy ? "Processing…" : "Generate"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ValidationSummary({ result }: { result: ValidationResult }) {
  const { summary, issues } = result;
  const topIssues = issues.slice(0, 6);

  return (
    <div className={`load-validation${summary.errors > 0 ? " has-errors" : ""}`}>
      <div className="load-validation-head">
        <span>Validation</span>
        <span>
          {summary.errors} errors · {summary.warnings} warnings
        </span>
      </div>
      {topIssues.length > 0 ? (
        <ul className="load-validation-list">
          {topIssues.map((issue) => (
            <li key={issue.id} data-severity={issue.severity}>
              <strong>{issue.code}</strong>
              <span>{issue.message}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="load-validation-empty">No validation issues found.</p>
      )}
      {issues.length > topIssues.length ? (
        <div className="load-validation-more">+{issues.length - topIssues.length} more issues</div>
      ) : null}
    </div>
  );
}
