import { useState } from "react";
import { useGtStore } from "../gtStore";
import { exportNotesCsv, exportNotesJson } from "../exportNotes";
import type { NoteReport } from "../types";
import type { ValidationIssue, ValidationResult } from "../validation";
import { Icon } from "../../components/icons";
import { LoadDialog } from "./LoadDialog";

export function TopBar() {
  const data = useGtStore((s) => s.data);
  const nodeNotes = useGtStore((s) => s.nodeNotes);
  const factNotes = useGtStore((s) => s.factNotes);
  const importNotes = useGtStore((s) => s.importNotes);
  const helpOpen = useGtStore((s) => s.helpOpen);
  const setHelpOpen = useGtStore((s) => s.setHelpOpen);
  const validationResult = useGtStore((s) => s.validationResult);

  const [loadOpen, setLoadOpen] = useState(false);
  const [validationOpen, setValidationOpen] = useState(false);

  const nodeCount = data?.nodes.length ?? 0;
  const factCount = data ? Object.keys(data.facts || {}).length : 0;
  const validationState = validationResult?.summary.errors
    ? "error"
    : validationResult?.summary.warnings
      ? "warning"
      : "ok";

  const handleImportFile = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        window.alert(importNotes(JSON.parse(String(ev.target?.result)) as NoteReport));
      } catch (err) {
        window.alert("JSON parse error: " + (err as Error).message);
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

        {data && validationResult ? (
          <button
            type="button"
            className={`btn-icon validation-chip ${validationState}`}
            title="Show validation results"
            onClick={() => setValidationOpen(true)}
          >
            <Icon name="validation" />
            <span>
              {validationResult.summary.errors}E · {validationResult.summary.warnings}W
            </span>
          </button>
        ) : null}

        <button
          type="button"
          className="btn-icon"
          title="Build data from 3 Excel files + report PDF"
          onClick={() => setLoadOpen(true)}
        >
          <Icon name="load" />
          <span>Load</span>
        </button>

        <div className="topbar-sep" />

        <label className="btn-icon" title="Import notes (JSON)">
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
          title="Save notes as JSON"
          onClick={() => data && exportNotesJson(data, nodeNotes, factNotes)}
        >
          <Icon name="save" />
          <span>JSON</span>
        </button>
        <button
          type="button"
          className="btn-icon"
          disabled={!data}
          title="Save notes as CSV"
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
          title="Help"
        >
          <Icon name="help" />
        </button>
      </div>
      {loadOpen ? <LoadDialog onClose={() => setLoadOpen(false)} /> : null}
      {validationOpen && validationResult ? (
        <ValidationPanel result={validationResult} onClose={() => setValidationOpen(false)} />
      ) : null}
    </>
  );
}

function ValidationPanel({ result, onClose }: { result: ValidationResult; onClose: () => void }) {
  const { summary, issues } = result;
  const [filter, setFilter] = useState<"all" | ValidationIssue["severity"]>("all");
  const filteredIssues = filter === "all" ? issues : issues.filter((issue) => issue.severity === filter);
  const issueCodeCounts = summarizeIssueCodes(issues);
  const filters: Array<{ key: "all" | ValidationIssue["severity"]; label: string; count: number }> = [
    { key: "all", label: "All", count: summary.total },
    { key: "error", label: "Errors", count: summary.errors },
    { key: "warning", label: "Warnings", count: summary.warnings },
    { key: "info", label: "Info", count: summary.infos },
  ];

  return (
    <div className="validation-panel-backdrop" onMouseDown={onClose}>
      <aside className="validation-panel" onMouseDown={(event) => event.stopPropagation()}>
        <div className="validation-panel-head">
          <div>
            <h3>Validation Results</h3>
            <p>
              {summary.errors} errors · {summary.warnings} warnings · {summary.infos} info
            </p>
          </div>
          <button type="button" className="btn-nav" onClick={onClose}>
            Close
          </button>
        </div>
        {issueCodeCounts.length > 0 ? (
          <div className="validation-code-summary" aria-label="Issue types">
            {issueCodeCounts.map(({ code, count }) => (
              <span key={code}>
                <strong>{count}</strong>
                {code}
              </span>
            ))}
          </div>
        ) : null}
        {issues.length > 0 ? (
          <div className="validation-filter-row" aria-label="Filter validation issues">
            {filters.map((item) => (
              <button
                key={item.key}
                type="button"
                className={filter === item.key ? "active" : ""}
                onClick={() => setFilter(item.key)}
              >
                {item.label}
                <span>{item.count}</span>
              </button>
            ))}
          </div>
        ) : null}
        {issues.length === 0 ? (
          <div className="validation-empty">No validation issues found.</div>
        ) : filteredIssues.length === 0 ? (
          <div className="validation-empty muted">No issues match this filter.</div>
        ) : (
          <ul className="validation-issue-list">
            {filteredIssues.map((issue) => (
              <ValidationIssueItem key={issue.id} issue={issue} />
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}

function summarizeIssueCodes(issues: ValidationIssue[]): Array<{ code: string; count: number }> {
  const counts = new Map<string, number>();
  issues.forEach((issue) => counts.set(issue.code, (counts.get(issue.code) ?? 0) + 1));
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 6)
    .map(([code, count]) => ({ code, count }));
}

function ValidationIssueItem({ issue }: { issue: ValidationIssue }) {
  const target = [issue.entityType, issue.entityId, issue.field].filter(Boolean).join(" · ");

  return (
    <li className="validation-issue" data-severity={issue.severity}>
      <div className="validation-issue-top">
        <span className="validation-code">{issue.code}</span>
        <span className="validation-severity">{issue.severity}</span>
      </div>
      <p>{issue.message}</p>
      {target ? <span className="validation-target">{target}</span> : null}
      {issue.relatedIds?.length ? (
        <span className="validation-related">Related: {issue.relatedIds.join(", ")}</span>
      ) : null}
    </li>
  );
}
