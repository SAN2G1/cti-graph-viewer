import { useEffect, useMemo, useRef, useState } from "react";
import mermaid from "mermaid";
import { useGtStore } from "../gtStore";
import type { ViewerData, ViewerFact } from "../types";

mermaid.initialize({
  startOnLoad: false,
  theme: "base",
  securityLevel: "loose",
  flowchart: {
    htmlLabels: true,
    curve: "linear",
    nodeSpacing: 30,
    rankSpacing: 70,
    padding: 12,
    useMaxWidth: false,
  },
  themeVariables: {
    fontFamily: "'Geist','Pretendard','Apple SD Gothic Neo','Segoe UI',sans-serif",
    fontSize: "13px",
    lineColor: "#b4b8bf",
    primaryBorderColor: "#bfc3c9",
    clusterBkg: "#f5f5f5",
  },
});

const isFactId = (id: string) => /^F/i.test(id || "");
const isCombineId = (id: string) => /^C/i.test(id || "");
const isNodeId = (id: string) => /^N/i.test(id || "");

function splitMembers(members: string[] | string | undefined): string[] {
  if (Array.isArray(members)) return members.filter(Boolean);
  return String(members || "")
    .split(/[,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function mmLabel(s: unknown): string {
  return String(s == null ? "" : s)
    .replace(/[\r\n]+/g, " ")
    .replace(/"/g, "#quot;")
    .trim();
}

function mmWrap(value: unknown, maxLen = 22, maxChars = 0): string {
  let s = mmLabel(value);
  if (maxChars && s.length > maxChars) s = s.slice(0, maxChars - 1).trimEnd() + "…";
  if (!s) return "";
  const lines: string[] = [];
  let line = "";
  const flush = () => {
    if (line) {
      lines.push(line);
      line = "";
    }
  };
  for (const word of s.split(/\s+/)) {
    let w = word;
    while (w.length > maxLen) {
      const room = maxLen - line.length - (line ? 1 : 0);
      if (room > 1) {
        line += (line ? " " : "") + w.slice(0, room);
        w = w.slice(room);
      }
      flush();
    }
    if (!line) line = w;
    else if (line.length + 1 + w.length <= maxLen) line += " " + w;
    else {
      flush();
      line = w;
    }
  }
  flush();
  return lines.join("<br>");
}

interface MermaidResult {
  code: string;
  counts: { facts: number; combines: number; nodes: number };
}

function generateMermaid(data: ViewerData): MermaidResult {
  const nodes = data.nodes || [];
  const facts = data.facts || {};
  const combines = Array.isArray(data.combines) ? data.combines : [];
  const combineById: Record<string, (typeof combines)[number]> = {};
  combines.forEach((c) => {
    combineById[c.combine_id] = c;
  });
  const hasCombines = combines.length > 0;

  const terminalNode = (cid: string): string | undefined => {
    let cur = combineById[cid] ? combineById[cid].consumer : undefined;
    const seen = new Set<string>();
    while (cur && isCombineId(cur) && combineById[cur] && !seen.has(cur)) {
      seen.add(cur);
      cur = combineById[cur].consumer;
    }
    return cur;
  };

  const suppressed: Record<string, Set<string>> = {};
  if (hasCombines) {
    combines.forEach((c) => {
      const term = terminalNode(c.combine_id);
      if (!term) return;
      splitMembers(c.members).forEach((m) => {
        if (isFactId(m)) (suppressed[m] || (suppressed[m] = new Set())).add(term);
      });
    });
  }

  const realProducers = (f: ViewerFact) => (f.producers || []).filter(isNodeId);

  const L: string[] = [];
  L.push("flowchart TD");
  L.push("    classDef factNode fill:#FFE8B0,stroke:#B8860B,color:#000;");
  L.push("    classDef combineNode fill:#CFE2FF,stroke:#0B5394,color:#000;");
  L.push("    classDef techNode fill:#EEEEEE,stroke:#555,color:#000;");
  L.push("");

  const extFacts = Object.values(facts).filter((f) => f.is_external === true);
  if (extFacts.length) {
    L.push("    %% External facts");
    extFacts.forEach((f) => {
      L.push(`    ${f.fact_id}("${mmLabel(f.fact_id + ": " + (f.name || ""))}")`);
    });
    L.push("");
  }

  if (nodes.length) {
    L.push("    %% Technique nodes");
    nodes.forEach((n) => {
      const head = mmLabel([n.node_id, n.technique_id].filter(Boolean).join(" "));
      const name = mmWrap(n.technique_name || "", 22);
      L.push(`    ${n.node_id}["${head}${name ? "<br>" + name : ""}"]`);
    });
    L.push("");
  }

  if (hasCombines) {
    L.push("    %% Combine");
    combines.forEach((c) => {
      const head = mmLabel(c.combine_id + " " + (c.operator || "AND"));
      const lab = mmWrap(c.label || "", 26, 90);
      L.push(`    ${c.combine_id}{{"${head}${lab ? "<br>" + lab : ""}"}}`);
    });
    L.push("");
  }

  const edgeSet = new Set<string>();
  const edges: string[] = [];
  const addEdge = (line: string) => {
    if (!edgeSet.has(line)) {
      edgeSet.add(line);
      edges.push(line);
    }
  };
  const flowFactInto = (f: ViewerFact, target: string) => {
    if (f.is_external === true) {
      addEdge(`    ${f.fact_id} --> ${target}`);
    } else {
      realProducers(f).forEach((p) => addEdge(`    ${p} -->|${f.fact_id}| ${target}`));
    }
  };

  if (hasCombines) {
    combines.forEach((c) => {
      if (c.consumer) addEdge(`    ${c.combine_id} --> ${c.consumer}`);
      splitMembers(c.members).forEach((m) => {
        if (isFactId(m)) {
          const f = facts[m];
          if (f) flowFactInto(f, c.combine_id);
          else addEdge(`    ${m} --> ${c.combine_id}`);
        }
      });
    });
  }

  Object.values(facts).forEach((f) => {
    (f.consumers || []).forEach((cons) => {
      if (!isNodeId(cons)) return;
      if (suppressed[f.fact_id] && suppressed[f.fact_id].has(cons)) return;
      flowFactInto(f, cons);
    });
  });

  if (edges.length) {
    L.push("    %% Edges — fact / combine flow");
    L.push(...edges);
    L.push("");
  }

  if (extFacts.length) L.push("    class " + extFacts.map((f) => f.fact_id).join(",") + " factNode;");
  if (hasCombines) L.push("    class " + combines.map((c) => c.combine_id).join(",") + " combineNode;");
  if (nodes.length) L.push("    class " + nodes.map((n) => n.node_id).join(",") + " techNode;");

  return {
    code: L.join("\n"),
    counts: { facts: extFacts.length, combines: combines.length, nodes: nodes.length },
  };
}

export function MermaidDiagram() {
  const data = useGtStore((s) => s.data);
  const renderRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "info" | "error"; message?: string }>({ kind: "info" });

  const { code, counts } = useMemo<MermaidResult>(
    () => (data ? generateMermaid(data) : { code: "", counts: { facts: 0, combines: 0, nodes: 0 } }),
    [data],
  );

  useEffect(() => {
    let cancelled = false;
    const el = renderRef.current;
    if (!el) return;
    if (!data || (!counts.nodes && !counts.facts && !counts.combines)) {
      setStatus({ kind: "info" });
      el.innerHTML = "";
      return;
    }
    setStatus({ kind: "info", message: "Rendering diagram…" });
    mermaid
      .render("ttps-flow-" + Math.abs(hashCode(code)), code)
      .then(({ svg }) => {
        if (cancelled || !renderRef.current) return;
        renderRef.current.innerHTML = svg;
        applyZoom(renderRef.current, zoom);
        setStatus({ kind: "ok" });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setStatus({ kind: "error", message: (err as Error)?.message || String(err) });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, data]);

  useEffect(() => {
    if (renderRef.current) applyZoom(renderRef.current, zoom);
  }, [zoom]);

  const changeZoom = (dir: number) => {
    if (dir === 0) setZoom(1);
    else setZoom((z) => Math.min(3, Math.max(0.3, z + dir * 0.15)));
  };

  const copyMermaid = () => {
    if (!code) return;
    navigator.clipboard?.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const download = (name: string, content: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadSvg = () => {
    const svg = renderRef.current?.querySelector("svg");
    if (!svg) return;
    const xml = new XMLSerializer().serializeToString(svg);
    download("ttps_flow.svg", '<?xml version="1.0" encoding="UTF-8"?>\n' + xml, "image/svg+xml");
  };

  return (
    <div className="notion-scroll">
      <div className="notion-page">
        <div className="notion-kicker">Flow Diagram</div>
        <div className="notion-title">Data-flow Diagram</div>
        <div className="notion-meta">
          {data ? `${counts.nodes} nodes · ${counts.facts} external facts · ${counts.combines} combines` : "—"}
        </div>

        <div className="legend-row">
          <span className="legend-item"><span className="mmd-legend-swatch sw-fact" /> Fact <span className="legend-sub">external</span></span>
          <span className="legend-item"><span className="mmd-legend-swatch sw-combine" /> Combine <span className="legend-sub">AND / OR</span></span>
          <span className="legend-item"><span className="mmd-legend-swatch sw-tech" /> Technique</span>
        </div>

        <div className="diagram-split">
        <div className="notion-block">
          <div className="notion-block-head">
            <span className="notion-block-label">Flow</span>
            <div className="diagram-toolbar">
              <div className="btn-group">
                <button type="button" className="btn-mini" onClick={() => changeZoom(-1)} title="Zoom out">−</button>
                <span className="zoom-label">{Math.round(zoom * 100)}%</span>
                <button type="button" className="btn-mini" onClick={() => changeZoom(1)} title="Zoom in">+</button>
              </div>
              <button type="button" className="btn-mini" onClick={() => changeZoom(0)} title="Fit to width">Fit</button>
              <button type="button" className="btn-mini" onClick={downloadSvg} title="Save SVG">SVG</button>
            </div>
          </div>
          <div className="diagram-canvas">
            {status.kind === "error" ? (
              <div className="diagram-status error">
                Failed to render diagram:{"\n"}
                {status.message}
                {"\n\n"}Copy the Mermaid code below to inspect it directly.
              </div>
            ) : !data || (!counts.nodes && !counts.facts && !counts.combines) ? (
              <div className="diagram-status">No nodes or facts to display.</div>
            ) : status.message ? (
              <div className="diagram-status">{status.message}</div>
            ) : null}
            <div className="diagram-render" ref={renderRef} />
          </div>
        </div>

        <div className="notion-block">
          <div className="notion-block-head">
            <span className="notion-block-label">Mermaid code</span>
            <div className="diagram-toolbar">
              <button type="button" className={`btn-mini${copied ? " copied" : ""}`} onClick={copyMermaid}>
                {copied ? "Copied ✓" : "Copy"}
              </button>
              <button
                type="button"
                className="btn-mini"
                onClick={() => code && download("ttps_flow.mmd", code, "text/plain")}
              >
                Save .mmd
              </button>
            </div>
          </div>
          <pre className="notion-code">{code}</pre>
        </div>
        </div>
      </div>
    </div>
  );
}

function applyZoom(container: HTMLElement, zoom: number) {
  const svg = container.querySelector("svg");
  if (svg) {
    (svg as SVGElement).style.width = zoom * 100 + "%";
    (svg as SVGElement).style.maxWidth = "none";
  }
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h;
}
