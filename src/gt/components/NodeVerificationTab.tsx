import { useEffect, useRef, useState } from "react";
import { useGtStore } from "../gtStore";
import { NodeDependencyGraph } from "./NodeDependencyGraph";
import { ReportPages } from "./ReportPages";
import { RequirementsTree } from "./RequirementsTree";

export function NodeVerificationTab({ active }: { active: boolean }) {
  const data = useGtStore((s) => s.data);
  const nodeIndex = useGtStore((s) => s.nodeIndex);
  const nodeNotes = useGtStore((s) => s.nodeNotes);
  const reportViewMode = useGtStore((s) => s.reportViewMode);
  const navigateNode = useGtStore((s) => s.navigateNode);
  const jumpToNode = useGtStore((s) => s.jumpToNode);
  const setNodeNote = useGtStore((s) => s.setNodeNote);
  const setReportViewMode = useGtStore((s) => s.setReportViewMode);

  const [listOpen, setListOpen] = useState(false);
  const [nodeSearch, setNodeSearch] = useState("");
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!listOpen) return;
    const onDown = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setListOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [listOpen]);

  if (!data) {
    return (
      <div className={`tab-pane${active ? " active" : ""}`} id="tab-nodes">
        <div className="gt-empty">상단 <strong>Load</strong> 버튼으로 정답지 Excel 3개(node·fact·combine)와 보고서 PDF를 올려 데이터를 생성하세요.</div>
      </div>
    );
  }

  const total = data.nodes.length;
  const node = data.nodes[nodeIndex];
  const note = node ? nodeNotes[node.node_id] ?? "" : "";
  const progressPct = total > 1 ? (nodeIndex / (total - 1)) * 100 : 100;

  const query = nodeSearch.trim().toLowerCase();
  const matches = data.nodes
    .map((n, i) => ({ n, i }))
    .filter(({ n }) => {
      if (!query) return true;
      return [n.node_id, n.tactic, n.technique_id, n.technique_name]
        .map((x) => String(x ?? "").toLowerCase())
        .join(" ")
        .includes(query);
    });

  return (
    <div className={`tab-pane${active ? " active" : ""}`} id="tab-nodes">
      <div id="nav-bar">
        <span className="nav-counter">
          <span>{nodeIndex + 1}</span>
          <span className="total"> / {total}</span>
        </span>
        <div className="node-picker" ref={pickerRef}>
          <button
            type="button"
            className={`btn-nav${listOpen ? " active" : ""}`}
            onClick={() => setListOpen((v) => !v)}
          >
            Node List
          </button>
          <div className={`node-picker-dropdown${listOpen ? " open" : ""}`}>
            <div className="node-picker-search-wrap">
              <input
                className="node-picker-search"
                placeholder="ID, 기법, 전술 검색..."
                value={nodeSearch}
                onChange={(e) => setNodeSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setListOpen(false);
                }}
              />
            </div>
            <ul className="node-picker-list">
              {matches.length === 0 ? (
                <li className="node-pick-empty">검색 결과 없음</li>
              ) : (
                matches.map(({ n, i }) => {
                  const name = n.technique_name || n.technique_id || "(기법 미지정)";
                  return (
                    <li
                      key={n.node_id}
                      className={`node-pick-item${i === nodeIndex ? " active" : ""}`}
                      title={name}
                      onClick={() => {
                        jumpToNode(i);
                        setListOpen(false);
                      }}
                    >
                      <span className={`node-pick-dot${nodeNotes[n.node_id]?.trim() ? " has-note" : ""}`} />
                      <span className="node-pick-id">{n.node_id}</span>
                      <span className="node-pick-name">{name}</span>
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        </div>
        <button type="button" className="btn-nav" onClick={() => navigateNode(-1)} disabled={nodeIndex === 0}>
          Prev
        </button>
        <button type="button" className="btn-nav" onClick={() => navigateNode(1)} disabled={nodeIndex === total - 1}>
          Next
        </button>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: progressPct + "%" }} />
        </div>
      </div>

      {node ? (
        <div id="node-content">
          {/* Hero */}
          <div className="node-hero">
            <div className="node-hero-top">
              <span className="node-id">{node.node_id}</span>
              {node.technique_id ? <span className="node-tech-id">{node.technique_id}</span> : null}
              {node.tactic ? <span className="tactic-pill">{node.tactic}</span> : null}
            </div>
            <h2 className="node-name">{node.technique_name || node.technique_id || "—"}</h2>
            {node.behavior_summary ? <p className="node-behavior">{node.behavior_summary}</p> : null}
          </div>

          {/* Main column */}
          <div className="node-main">
            <section className="card">
              <div className="card-header"><span className="card-label">Requirements</span></div>
              <div className="card-body">
                <RequirementsTree items={node.requirements} />
              </div>
            </section>

            <section className="card">
              <div className="card-header"><span className="card-label">Parsers</span></div>
              <div className="card-body">
                {!node.parsers || node.parsers.length === 0 ? (
                  <span className="empty-state">Parsers 없음</span>
                ) : (
                  node.parsers.map((p, i) => (
                    <div key={i} className={`fact-chip${p.inferred_flag ? " inferred" : ""}`}>
                      <div className="fact-content">
                        <span className="fact-name">{p.name || p.fact_id || "—"}</span>
                        {p.description ? <span className="fact-desc">{p.description}</span> : null}
                      </div>
                      {p.inferred_flag ? <span className="fact-inferred-badge">Inferred</span> : null}
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="card">
              <div className="card-header"><span className="card-label">Relationships</span></div>
              <div className="card-body">
                {node.relationships ? (
                  <div className="relationships-text">{node.relationships}</div>
                ) : (
                  <span className="empty-state">Relationships 없음</span>
                )}
              </div>
            </section>

            <section className="card">
              <div className="card-header">
                <span className="card-label">Report Pages</span>
                <div className="view-mode-toggle">
                  <button
                    type="button"
                    className={reportViewMode === "text" ? "active" : ""}
                    onClick={() => setReportViewMode("text")}
                  >
                    Text
                  </button>
                  <button
                    type="button"
                    className={reportViewMode === "image" ? "active" : ""}
                    onClick={() => setReportViewMode("image")}
                  >
                    Image
                  </button>
                </div>
              </div>
              <div className="card-body">
                <ReportPages pages={node.report_pages} emptyText="참조 페이지 없음" />
              </div>
            </section>
          </div>

          {/* Rail */}
          <div className="node-rail">
            <section className="card">
              <div className="card-header"><span className="card-label">Dependency</span></div>
              <div className="card-body">
                <NodeDependencyGraph nodeId={node.node_id} />
              </div>
            </section>

            <section className="card">
              <div className="card-header"><span className="card-label">Note</span></div>
              <div className="card-body">
                <textarea
                  className="note-area"
                  placeholder="이 노드에 대한 메모..."
                  value={note}
                  onChange={(e) => setNodeNote(e.target.value)}
                />
              </div>
            </section>
          </div>
        </div>
      ) : null}
    </div>
  );
}
