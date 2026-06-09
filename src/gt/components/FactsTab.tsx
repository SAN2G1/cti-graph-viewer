import { useState } from "react";
import { useGtStore } from "../gtStore";
import { ReportPages } from "./ReportPages";

export function FactsTab({ active }: { active: boolean }) {
  const data = useGtStore((s) => s.data);
  const factNotes = useGtStore((s) => s.factNotes);
  const selectedFactId = useGtStore((s) => s.selectedFactId);
  const selectFact = useGtStore((s) => s.selectFact);
  const setFactNote = useGtStore((s) => s.setFactNote);
  const reportViewMode = useGtStore((s) => s.reportViewMode);
  const setReportViewMode = useGtStore((s) => s.setReportViewMode);

  const [search, setSearch] = useState("");

  const allFacts = data ? Object.values(data.facts || {}) : [];
  const q = search.toLowerCase();
  const filtered = allFacts.filter(
    (f) =>
      !q ||
      (f.name || "").toLowerCase().includes(q) ||
      (f.fact_id || "").toLowerCase().includes(q) ||
      (f.description || "").toLowerCase().includes(q),
  );

  const fact = selectedFactId && data ? data.facts[selectedFactId] : undefined;
  const note = selectedFactId ? factNotes[selectedFactId] ?? "" : "";
  const extLabel = fact?.is_external === true ? "external" : fact?.is_external === false ? "internal" : "unknown";

  return (
    <div className={`tab-pane${active ? " active" : ""}`} id="tab-facts">
      <div className="facts-sidebar">
        <div className="facts-search-wrap">
          <input
            className="facts-search"
            placeholder="Fact 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <ul className="facts-list">
          {filtered.map((f) => (
            <li
              key={f.fact_id}
              className={`fact-list-item${f.inferred_flag ? " inferred-item" : ""}${
                selectedFactId === f.fact_id ? " active" : ""
              }`}
              onClick={() => selectFact(f.fact_id)}
            >
              {f.inferred_flag ? <div className="fact-inf-dot" /> : null}
              <span className="fact-list-name">{f.name || f.fact_id}</span>
              {factNotes[f.fact_id]?.trim() ? <div className="fact-note-dot" /> : null}
            </li>
          ))}
        </ul>
      </div>

      <div className="fact-detail">
        {!fact || !selectedFactId ? (
          <div className="fact-detail-empty">← Fact를 선택하세요</div>
        ) : (
          <>
            <div className="node-hero">
              <div className="node-hero-top">
                <span className="node-id">{selectedFactId}</span>
                {fact.inferred_flag ? <span className="tactic-pill">Inferred</span> : null}
                <span className="fact-ext-badge" data-ext={extLabel}>
                  is_external: {String(fact.is_external ?? "—")}
                </span>
              </div>
              <h2 className="node-name fact-name-hero">{fact.name || "—"}</h2>
              <div className="fact-meta-row">
                <span>Level <b>{fact.level || "—"}</b></span>
                {fact.producers?.length ? <span>Producers <b>{fact.producers.join(", ")}</b></span> : null}
                {fact.consumers?.length ? <span>Consumers <b>{fact.consumers.join(", ")}</b></span> : null}
              </div>
              {fact.description ? <p className="node-behavior">{fact.description}</p> : null}
            </div>

            <div className="fact-body">
              <section className="card">
                <div className="card-header"><span className="card-label">Note</span></div>
                <div className="card-body">
                  <textarea
                    className="note-area"
                    placeholder="이 Fact에 대한 메모..."
                    value={note}
                    onChange={(e) => setFactNote(selectedFactId, e.target.value)}
                  />
                </div>
              </section>

              <section className="card">
                <div className="card-header">
                  <span className="card-label">Report Pages</span>
                  <div className="view-mode-toggle">
                    <button type="button" className={reportViewMode === "text" ? "active" : ""} onClick={() => setReportViewMode("text")}>Text</button>
                    <button type="button" className={reportViewMode === "image" ? "active" : ""} onClick={() => setReportViewMode("image")}>Image</button>
                  </div>
                </div>
                <div className="card-body">
                  <ReportPages pages={fact.report_pages} emptyText="연결된 페이지 없음" />
                </div>
              </section>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
