import { useEffect, useMemo, useRef } from "react";
import cytoscape from "cytoscape";
import fcose from "cytoscape-fcose";
import { useGraphStore } from "../store/graphStore";
import { buildCytoscapeElements } from "../utils/graphBuilder";
import { buildAttackConditionLayout, buildDependencyLaneLayout, buildDirectedFlowLayout } from "../utils/graphAlgorithms";
import { ALLOWED_TACTICS } from "../constants/allowedValues";

cytoscape.use(fcose);

export function GraphCanvas() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  const didRunInitialLayoutRef = useRef(false);
  const previousViewModeRef = useRef<string | null>(null);
  const previousSelectionKeyRef = useRef("");
  const parsed = useGraphStore((state) => state.parsed);
  const selectedIds = useGraphStore((state) => state.selectedIds);
  const viewMode = useGraphStore((state) => state.viewMode);
  const searchTerm = useGraphStore((state) => state.searchTerm);
  const tacticFilter = useGraphStore((state) => state.tacticFilter);
  const severityFilter = useGraphStore((state) => state.severityFilter);
  const showExternalFacts = useGraphStore((state) => state.showExternalFacts);
  const showExecutionRequiredFacts = useGraphStore((state) => state.showExecutionRequiredFacts);
  const layoutVersion = useGraphStore((state) => state.layoutVersion);
  const flowLayoutVersion = useGraphStore((state) => state.flowLayoutVersion);
  const flowLayoutMode = useGraphStore((state) => state.flowLayoutMode);
  const fitVersion = useGraphStore((state) => state.fitVersion);
  const showLegend = useGraphStore((state) => state.showLegend);
  const setCy = useGraphStore((state) => state.setCy);
  const setSelectedIds = useGraphStore((state) => state.setSelectedIds);

  const elements = useMemo(() => {
    if (!parsed) return [];
    return buildCytoscapeElements(parsed, {
      viewMode,
      selectedIds: viewMode === "focus" ? selectedIds : [],
      searchTerm,
      tacticFilter,
      severityFilter,
      showExternalFacts,
      showExecutionRequiredFacts,
    });
  }, [parsed, viewMode, viewMode === "focus" ? selectedIds.join("|") : "", searchTerm, tacticFilter, severityFilter, showExternalFacts, showExecutionRequiredFacts]);

  useEffect(() => {
    if (!containerRef.current || cyRef.current) return;
    const cy = cytoscape({
      container: containerRef.current,
      elements: [],
      style: graphStyle,
      wheelSensitivity: 0.75,
      minZoom: 0.08,
      maxZoom: 4,
      autoungrabify: true,
    });
    cy.on("tap", "node", (event) => {
      if (event.target.hasClass("tactic-band")) return;
      setSelectedIds([event.target.id()]);
    });
    cy.on("tap", (event) => {
      if (event.target === cy) setSelectedIds([]);
    });
    cy.on("mouseover", "edge", (event) => {
      const edge = event.target;
      const hoverLabel = edge.data("hoverLabel") as string | undefined;
      if (hoverLabel) {
        edge.data("displayLabel", hoverLabel);
        edge.addClass("edge-hover");
      }
    });
    cy.on("mouseout", "edge", (event) => {
      const edge = event.target;
      edge.data("displayLabel", edge.data("label"));
      edge.removeClass("edge-hover");
    });
    cyRef.current = cy;
    setCy(cy);

    return () => {
      cy.destroy();
      cyRef.current = null;
      setCy(null);
    };
  }, [setCy, setSelectedIds]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const previousPositions = new Map<string, cytoscape.Position>();
    cy.nodes().forEach((node) => {
      previousPositions.set(node.id(), { ...node.position() });
    });
    const nodeElements = elements.filter((element) => !((element.data as Record<string, unknown>).source));
    const positionedNodeCount = nodeElements.filter((element) => {
      const id = (element.data as Record<string, unknown>).id;
      return id ? previousPositions.has(String(id)) : false;
    }).length;
    cy.elements().remove();
    cy.add(
      elements.map((element) => {
        const data = element.data as Record<string, unknown>;
        const id = data.id ? String(data.id) : "";
        const position = previousPositions.get(id);
        return position ? { ...element, position } : element;
      }),
    );
    cy.nodes().ungrabify();
    const viewModeChanged = previousViewModeRef.current !== viewMode;
    if (cy.nodes().length > 0 && (!didRunInitialLayoutRef.current || positionedNodeCount === 0 || viewModeChanged)) {
      runLayout(cy, viewMode, selectedIds);
      didRunInitialLayoutRef.current = true;
    }
    previousViewModeRef.current = viewMode;
    applyHighlight(cy, selectedIds, viewMode, parsed?.diagnostics ?? []);
  }, [elements, parsed?.diagnostics, viewMode]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    if (viewMode === "attack") runAttackFlowLayout(cy, selectedIds, { fitView: false });
    const selectionKey = selectedIds.join("|");
    applyHighlight(cy, selectedIds, viewMode, parsed?.diagnostics ?? [], {
      animateSelection: selectionKey !== previousSelectionKeyRef.current,
    });
    previousSelectionKeyRef.current = selectionKey;
  }, [selectedIds, viewMode, parsed?.diagnostics]);

  useEffect(() => {
    const cy = cyRef.current;
    if (cy && layoutVersion > 0) runLayout(cy, viewMode, selectedIds);
  }, [layoutVersion, viewMode]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || flowLayoutVersion === 0) return;
    runFlowLayout(cy, flowLayoutMode);
  }, [flowLayoutVersion, flowLayoutMode]);

  useEffect(() => {
    const cy = cyRef.current;
    if (cy && fitVersion > 0) cy.fit(undefined, 36);
  }, [fitVersion]);

  return (
    <section className="graph-section">
      <div ref={containerRef} className="graph-canvas" />
      {showLegend ? <GraphLegend viewMode={viewMode} /> : null}
    </section>
  );
}

function runLayout(cy: cytoscape.Core, viewMode: string, selectedIds: string[]): void {
  clearTacticBands(cy);

  if (viewMode === "attack") {
    runAttackFlowLayout(cy, selectedIds, { fitView: true });
    return;
  }

  const orientation = cy.width() >= cy.height() ? "horizontal" : "vertical";
  const positions = buildDependencyLaneLayout(cy, orientation);

  cy.batch(() => {
    for (const [id, position] of positions) {
      const node = cy.getElementById(id);
      if (node.nonempty()) node.position(position);
    }
  });

  addTacticBands(cy, orientation);
  cy.fit(undefined, 48);
}

function runAttackFlowLayout(
  cy: cytoscape.Core,
  selectedIds: string[],
  options: {
    fitView?: boolean;
  } = {},
): void {
  clearTacticBands(cy);
  const orientation = cy.width() >= cy.height() ? "horizontal" : "vertical";
  const positions = buildAttackConditionLayout(cy, orientation, selectedIds);

  cy.batch(() => {
    for (const [id, position] of positions) {
      const node = cy.getElementById(id);
      if (node.nonempty()) node.position(position);
    }
  });

  addTacticBands(cy, orientation);
  if (options.fitView !== false) cy.fit(undefined, 56);
}

function runFlowLayout(cy: cytoscape.Core, mode: "default" | "mitre"): void {
  clearTacticBands(cy);
  const orientation = cy.width() >= cy.height() ? "horizontal" : "vertical";
  const positions = buildDirectedFlowLayout(cy, orientation, {
    rankMode: mode === "mitre" ? "mitre-tactic" : "directed-flow",
  });

  cy.batch(() => {
    for (const [id, position] of positions) {
      const node = cy.getElementById(id);
      if (node.nonempty()) node.position(position);
    }
  });

  if (mode === "mitre") {
    addTacticBands(cy, orientation);
  }

  cy.fit(undefined, 48);
}

function clearTacticBands(cy: cytoscape.Core): void {
  cy.nodes(".tactic-band").remove();
}

function addTacticBands(cy: cytoscape.Core, orientation: "horizontal" | "vertical"): void {
  const paddingX = 86;
  const paddingY = 76;
  const bandGap = 18;
  const bandSpecs: Array<{
    tactic: string;
    tacticIndex: number;
    tacticNodes: cytoscape.NodeCollection;
    center: cytoscape.Position;
    width: number;
    height: number;
  }> = [];

  ALLOWED_TACTICS.forEach((tactic, tacticIndex) => {
    const tacticNodes = cy.nodes(".attack-node").filter((node) => node.data("tactic") === tactic);
    if (tacticNodes.empty()) return;

    const bounds = tacticNodes.boundingBox({ includeLabels: true, includeOverlays: false });
    const minX = bounds.x1 - paddingX;
    const maxX = bounds.x2 + paddingX;
    const minY = bounds.y1 - paddingY;
    const maxY = bounds.y2 + paddingY;
    const width = Math.max(220, maxX - minX);
    const height = Math.max(150, maxY - minY);
    const center = {
      x: minX + width / 2,
      y: minY + height / 2,
    };
    bandSpecs.push({ tactic, tacticIndex, tacticNodes, center, width, height });
  });

  if (bandSpecs.length === 0) return;

  const primary = orientation === "horizontal" ? "x" : "y";
  const sizeKey = orientation === "horizontal" ? "width" : "height";
  let previousEnd = Number.NEGATIVE_INFINITY;

  const bandElements = bandSpecs.map((spec) => {
    const size = spec[sizeKey];
    const start = spec.center[primary] - size / 2;
    const minStart = previousEnd + bandGap;
    if (start < minStart) {
      const shift = minStart - start;
      spec.center[primary] += shift;
      spec.tacticNodes.forEach((node) => {
        const position = node.position();
        node.position({
          ...position,
          [primary]: position[primary] + shift,
        });
      });
    }
    previousEnd = spec.center[primary] + size / 2;


    return {
      data: {
        id: `__tactic_band_${spec.tacticIndex}`,
        entityType: "tactic-band",
        label: spec.tactic,
        width: spec.width,
        height: spec.height,
      },
      position: spec.center,
      classes: "tactic-band",
      selectable: false,
      grabbable: false,
    };
  });

  const bands = cy.add(bandElements);
  bands.ungrabify();
  bands.unselectify();
}

function applyHighlight(
  cy: cytoscape.Core,
  selectedIds: string[],
  viewMode: string,
  diagnostics: import("../types/graph").GraphDiagnostic[],
  options?: {
    animateSelection?: boolean;
  },
): void {
  cy.elements().removeClass("selected one-hop two-hop dimmed diagnostic-focus connected-edge incoming-edge outgoing-edge adjacent-node");
  let selected = cy.collection();
  selectedIds.forEach((id) => {
    const element = cy.getElementById(id);
    if (element.nonempty()) selected = selected.union(element);
  });

  if (viewMode === "diagnostics") {
    const diagnosticIds = new Set(diagnostics.flatMap((diagnostic) => diagnostic.relatedIds));
    cy.nodes().forEach((node) => {
      if (diagnosticIds.has(node.id())) node.addClass("diagnostic-focus");
      else node.addClass("dimmed");
    });
  }

  if (selected.empty()) return;
  const connectedEdges = selected.connectedEdges();
  const incomingEdges = connectedEdges.filter((edge) => selected.contains(edge.target()) && !selected.contains(edge.source()));
  const outgoingEdges = connectedEdges.filter((edge) => selected.contains(edge.source()) && !selected.contains(edge.target()));
  const internalEdges = connectedEdges.difference(incomingEdges).difference(outgoingEdges);
  const adjacentNodes = connectedEdges.connectedNodes().difference(selected);
  const oneHop = selected.neighborhood();
  const twoHop = oneHop.neighborhood().difference(selected).difference(oneHop);
  cy.elements().difference(selected.union(oneHop).union(twoHop).union(connectedEdges).union(adjacentNodes)).addClass("dimmed");
  selected.addClass("selected");
  adjacentNodes.addClass("adjacent-node");
  internalEdges.addClass("connected-edge");
  incomingEdges.addClass("incoming-edge");
  outgoingEdges.addClass("outgoing-edge");
  oneHop.addClass("one-hop");
  twoHop.addClass("two-hop");

  const first = selected.first();
  if (options?.animateSelection !== false) {
    if (selected.length > 1) cy.animate({ fit: { eles: selected.union(adjacentNodes), padding: 72 } }, { duration: 250 });
    else if (first.nonempty()) cy.animate({ center: { eles: first }, zoom: Math.max(cy.zoom(), 1.1) }, { duration: 250 });
  }
}


function GraphLegend({ viewMode }: { viewMode: string }) {
  const items = viewMode === "attack"
    ? [
        ["legend-line incoming", "Selected incoming"],
        ["legend-line outgoing", "Selected outgoing"],
        ["legend-line fact", "Fact condition"],
        ["legend-line combine", "Gate output"],
        ["legend-swatch external", "External input"],
        ["legend-swatch and", "AND gate"],
        ["legend-swatch or", "OR gate"],
      ]
    : [
        ["legend-line incoming", "Selected incoming"],
        ["legend-line outgoing", "Selected outgoing"],
        ["legend-line combine", "Combine output"],
        ["legend-swatch fact", "Fact"],
        ["legend-swatch external", "External fact"],
        ["legend-swatch attack", "Attack node"],
        ["legend-swatch and", "AND gate"],
        ["legend-swatch or", "OR gate"],
      ];

  return (
    <aside className="graph-legend">
      <h3>Legend</h3>
      <div className="graph-legend-list">
        {items.map(([className, label]) => (
          <div key={label} className="graph-legend-item">
            <span className={className} />
            <span>{label}</span>
          </div>
        ))}
      </div>
    </aside>
  );
}

const graphStyle = [
  {
    selector: "node",
    style: {
      label: "data(label)",
      "font-size": 11,
      "text-valign": "center",
      "text-halign": "center",
      color: "#172033",
      "text-wrap": "wrap",
      "text-max-width": 130,
      width: 92,
      height: 54,
      "background-color": "#f8fafc",
      "border-width": 2,
      "border-color": "#94a3b8",
      "overlay-opacity": 0,
    },
  },
  {
    selector: ".attack-node",
    style: {
      shape: "round-rectangle",
      "background-color": "#e8f1ff",
      "border-color": "#2563eb",
    },
  },
  {
    selector: ".tactic-band",
    style: {
      shape: "round-rectangle",
      width: "data(width)",
      height: "data(height)",
      label: "data(label)",
      "font-size": 13,
      "font-weight": 700,
      "text-valign": "top",
      "text-halign": "center",
      "text-margin-y": 10,
      color: "#475569",
      "background-color": "#f8fafc",
      "background-opacity": 0.35,
      "border-color": "#94a3b8",
      "border-style": "dashed",
      "border-width": 2,
      "events": "no",
      "z-index": 0,
    },
  },
  {
    selector: ".fact-node",
    style: {
      shape: "ellipse",
      width: 80,
      height: 42,
      "font-size": 10,
      "text-max-width": 108,
      "background-color": "#ecfdf5",
      "border-color": "#059669",
    },
  },
  {
    selector: ".external-fact",
    style: {
      "border-style": "dashed",
    },
  },
  {
    selector: ".execution-required",
    style: {
      "border-width": 4,
    },
  },
  {
    selector: ".combine-node",
    style: {
      shape: "diamond",
      width: 62,
      height: 62,
      "font-size": 10,
      "text-max-width": 84,
      "background-color": "#fff7ed",
    },
  },
  {
    selector: ".attack-flow-fact",
    style: {
      width: 90,
      height: 46,
      "font-size": 10,
      "text-max-width": 110,
      "background-color": "#f0fdf4",
      "border-width": 3,
    },
  },
  {
    selector: ".attack-flow-gate",
    style: {
      width: 70,
      height: 70,
      label: "data(label)",
      "font-size": 16,
      "font-weight": 800,
      "text-max-width": 46,
      color: "#111827",
      "background-color": "#fff7ed",
      "border-width": 4,
      "z-index": 10,
    },
  },
  {
    selector: ".and-combine",
    style: {
      "border-color": "#dc2626",
    },
  },
  {
    selector: ".or-combine",
    style: {
      "border-color": "#0284c7",
    },
  },
  {
    selector: ".nested-combine",
    style: {
      "border-width": 4,
    },
  },
  {
    selector: ".has-diagnostic",
    style: {
      "border-color": "#ef4444",
      "border-width": 4,
    },
  },
  {
    selector: "edge",
    style: {
      label: "data(displayLabel)",
      "font-size": 9,
      color: "#475569",
      width: 2,
      "line-color": "#64748b",
      "target-arrow-shape": "triangle",
      "target-arrow-color": "#64748b",
      "curve-style": "bezier",
      "text-background-color": "#ffffff",
      "text-background-opacity": 0.85,
      "text-background-padding": 2,
      "text-rotation": "autorotate",
      "source-text-offset": 18,
      "target-text-offset": 18,
    },
  },
  {
    selector: ".combine-member-edge",
    style: {
      width: 3,
      "line-style": "dashed",
      "line-color": "#9a3412",
      "target-arrow-color": "#9a3412",
    },
  },
  {
    selector: ".supports-fact-edge",
    style: {
      width: 3,
      "line-color": "#0f766e",
      "target-arrow-color": "#0f766e",
    },
  },
  {
    selector: ".fact-condition-edge",
    style: {
      width: 3,
      "line-color": "#0f766e",
      "target-arrow-color": "#0f766e",
      color: "#065f46",
      "font-size": 10,
      "text-background-opacity": 1,
      "z-index": 16,
    },
  },
  {
    selector: ".combine-output-edge",
    style: {
      width: 4,
      "line-color": "#7c3aed",
      "target-arrow-color": "#7c3aed",
    },
  },
  {
    selector: ".diagnostic-edge",
    style: {
      "line-color": "#ef4444",
      "target-arrow-color": "#ef4444",
    },
  },
  {
    selector: ".connected-edge",
    style: {
      width: 5,
      "line-color": "#111827",
      "target-arrow-color": "#111827",
      color: "#111827",
      "font-size": 11,
      "z-index": 18,
    },
  },
  {
    selector: ".incoming-edge",
    style: {
      width: 5,
      "line-color": "#1d4ed8",
      "target-arrow-color": "#1d4ed8",
      color: "#1d4ed8",
      "font-size": 11,
      "z-index": 19,
    },
  },
  {
    selector: ".outgoing-edge",
    style: {
      width: 5,
      "line-color": "#d97706",
      "target-arrow-color": "#d97706",
      color: "#d97706",
      "font-size": 11,
      "z-index": 19,
    },
  },
  {
    selector: ".edge-hover",
    style: {
      width: 5,
      "line-color": "#0f766e",
      "target-arrow-color": "#0f766e",
      color: "#0f766e",
      "font-size": 12,
      "text-background-opacity": 1,
      "z-index": 24,
    },
  },
  {
    selector: ".selected",
    style: {
      "border-color": "#111827",
      "border-width": 5,
      "z-index": 20,
    },
  },
  {
    selector: ".adjacent-node",
    style: {
      "border-color": "#111827",
      "border-width": 3,
    },
  },
  {
    selector: ".one-hop",
    style: {
      opacity: 1,
      "z-index": 12,
    },
  },
  {
    selector: ".two-hop",
    style: {
      opacity: 0.75,
    },
  },
  {
    selector: ".dimmed",
    style: {
      opacity: 0.16,
    },
  },
  {
    selector: ".diagnostic-focus",
    style: {
      "border-color": "#f97316",
      "border-width": 5,
    },
  },
] as cytoscape.CytoscapeOptions["style"];
