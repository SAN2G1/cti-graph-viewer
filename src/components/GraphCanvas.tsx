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
  const showExternalFacts = useGraphStore((state) => state.showExternalFacts);
  const layoutVersion = useGraphStore((state) => state.layoutVersion);
  const flowLayoutVersion = useGraphStore((state) => state.flowLayoutVersion);
  const flowLayoutMode = useGraphStore((state) => state.flowLayoutMode);
  const fitVersion = useGraphStore((state) => state.fitVersion);
  const resetVersion = useGraphStore((state) => state.resetVersion);
  const showLegend = useGraphStore((state) => state.showLegend);
  const setCy = useGraphStore((state) => state.setCy);
  const setSelectedIds = useGraphStore((state) => state.setSelectedIds);
  // Persistent node positions, so manual drags survive element rebuilds
  // (search / filter). Updated on every layout and on drag release.
  const positionsRef = useRef<Map<string, cytoscape.Position>>(new Map());
  const prevParsedRef = useRef(parsed);

  const elements = useMemo(() => {
    if (!parsed) return [];
    return buildCytoscapeElements(parsed, {
      viewMode,
      searchTerm,
      showExternalFacts,
    });
  }, [parsed, viewMode, searchTerm, showExternalFacts]);

  useEffect(() => {
    if (!containerRef.current || cyRef.current) return;
    const cy = cytoscape({
      container: containerRef.current,
      elements: [],
      style: graphStyle,
      wheelSensitivity: 0.75,
      minZoom: 0.08,
      maxZoom: 4,
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

    // Reveal the full fact/technique name on hover (the in-shape label is
    // truncated to fit). Restored on mouse-out.
    cy.on("mouseover", "node", (event) => {
      const node = event.target;
      if (node.hasClass("tactic-band")) return;
      const full = node.data("fullLabel") as string | undefined;
      if (full && full !== node.data("label")) {
        node.scratch("_label", node.data("label"));
        node.data("label", full);
        node.addClass("node-hover");
      }
    });
    cy.on("mouseout", "node", (event) => {
      const node = event.target;
      const previous = node.scratch("_label") as string | undefined;
      if (previous != null) {
        node.data("label", previous);
        node.removeScratch("_label");
      }
      node.removeClass("node-hover");
    });

    // Constrain dragging so an attack node stays inside its tactic box. Facts
    // and combines are not constrained (they drag freely). The box is the
    // tactic band that contains the node at grab time. Bands exist in
    // tactic-banded layouts (Auto Layout / MITRE flow).
    type DragBox = { x1: number; x2: number; y1: number; y2: number };
    let dragBox: DragBox | null = null;
    // When a tactic box is grabbed, its attack nodes move with it (keeping their
    // relative positions inside the box).
    let dragBand: { last: cytoscape.Position; members: cytoscape.NodeCollection } | null = null;

    const chooseBox = (pos: cytoscape.Position): DragBox | null => {
      let box: DragBox | null = null;
      cy.nodes(".tactic-band").forEach((band) => {
        const bb = band.boundingBox({ includeLabels: false, includeOverlays: false });
        if (pos.x >= bb.x1 && pos.x <= bb.x2 && pos.y >= bb.y1 && pos.y <= bb.y2) {
          box = { x1: bb.x1, x2: bb.x2, y1: bb.y1, y2: bb.y2 };
        }
      });
      return box;
    };

    const clampToBox = (node: cytoscape.NodeSingular): void => {
      if (!dragBox) return;
      const pos = node.position();
      const halfW = node.width() / 2 + 4;
      const halfH = node.height() / 2 + 4;
      const loX = dragBox.x1 + halfW;
      const hiX = dragBox.x2 - halfW;
      const loY = dragBox.y1 + halfH;
      const hiY = dragBox.y2 - halfH;
      const x = hiX >= loX ? Math.min(Math.max(pos.x, loX), hiX) : (dragBox.x1 + dragBox.x2) / 2;
      const y = hiY >= loY ? Math.min(Math.max(pos.y, loY), hiY) : (dragBox.y1 + dragBox.y2) / 2;
      if (x !== pos.x || y !== pos.y) node.position({ x, y });
    };

    cy.on("grab", "node", (event) => {
      const node = event.target;
      if (node.hasClass("tactic-band")) {
        const tactic = node.data("label") as string;
        dragBand = {
          last: { ...node.position() },
          members: cy.nodes(".attack-node").filter((member) => member.data("tactic") === tactic),
        };
        dragBox = null;
        return;
      }
      dragBand = null;
      dragBox = node.hasClass("attack-node") ? chooseBox(node.position()) : null;
    });
    cy.on("drag", "node", (event) => {
      const node = event.target;
      if (node.hasClass("tactic-band")) {
        if (!dragBand) return;
        const pos = node.position();
        const dx = pos.x - dragBand.last.x;
        const dy = pos.y - dragBand.last.y;
        if (dx !== 0 || dy !== 0) {
          dragBand.members.forEach((member) => {
            const mp = member.position();
            member.position({ x: mp.x + dx, y: mp.y + dy });
          });
          dragBand.last = { ...pos };
        }
        return;
      }
      clampToBox(node);
    });
    cy.on("free", "node", (event) => {
      const node = event.target;
      if (node.hasClass("tactic-band")) {
        if (dragBand) {
          dragBand.members.forEach((member) => {
            positionsRef.current.set(member.id(), { ...member.position() });
          });
          dragBand = null;
        }
        return;
      }
      clampToBox(node);
      dragBox = null;
      positionsRef.current.set(node.id(), { ...node.position() });
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
    const saved = positionsRef.current;

    // A new dataset invalidates all remembered positions → force a fresh layout.
    if (prevParsedRef.current !== parsed) {
      saved.clear();
      didRunInitialLayoutRef.current = false;
      prevParsedRef.current = parsed;
    }

    const hadBands = cy.nodes(".tactic-band").nonempty();
    cy.elements().remove();
    cy.add(
      elements.map((element) => {
        const data = element.data as Record<string, unknown>;
        const id = data.id ? String(data.id) : "";
        const position = id ? saved.get(id) : undefined;
        return position ? { ...element, position: { ...position } } : element;
      }),
    );

    const realNodes = cy.nodes();
    const newNodes = realNodes.filter((node) => !saved.has(node.id()));
    const viewModeChanged = previousViewModeRef.current !== viewMode;
    const allNew = realNodes.length > 0 && newNodes.length === realNodes.length;
    const needFullLayout = !didRunInitialLayoutRef.current || viewModeChanged || allNew;

    if (realNodes.length > 0) {
      if (needFullLayout) {
        // Initial load / view switch / whole new node set: lay everything out.
        const fitNow = selectedIds.length === 0 || viewModeChanged;
        runLayout(cy, viewMode, selectedIds, { fit: fitNow });
        didRunInitialLayoutRef.current = true;
      } else {
        // Incremental change (search / filter): keep existing
        // positions, place only newly revealed nodes near their neighbours, and
        // redraw the tactic bands without nudging any node.
        if (newNodes.nonempty()) placeNewNodesNearNeighbors(cy, newNodes, saved);
        if (hadBands) {
          const orientation = cy.width() >= cy.height() ? "horizontal" : "vertical";
          addTacticBands(cy, orientation);
        }
      }
      capturePositions(cy, saved);
    }

    previousViewModeRef.current = viewMode;
    // Re-apply highlight classes after the rebuild without moving the viewport —
    // the selection effect owns the single pan/center animation.
    applyHighlight(cy, selectedIds, { animateSelection: false });
  }, [elements, viewMode, parsed]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    // Selecting a node only highlights and pans/centers the view — it must not
    // re-run the attack-flow layout (which would reposition nodes instead).
    const selectionKey = selectedIds.join("|");
    applyHighlight(cy, selectedIds, {
      animateSelection: selectionKey !== previousSelectionKeyRef.current,
    });
    previousSelectionKeyRef.current = selectionKey;
  }, [selectedIds, viewMode]);

  useEffect(() => {
    const cy = cyRef.current;
    if (cy && layoutVersion > 0) {
      runLayout(cy, viewMode, selectedIds);
      capturePositions(cy, positionsRef.current);
    }
  }, [layoutVersion, viewMode]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || flowLayoutVersion === 0) return;
    runFlowLayout(cy, flowLayoutMode);
    capturePositions(cy, positionsRef.current);
  }, [flowLayoutVersion, flowLayoutMode]);

  useEffect(() => {
    const cy = cyRef.current;
    if (cy && fitVersion > 0) cy.fit(undefined, 36);
  }, [fitVersion]);

  // Reset discards manual drag positions so the next layout (triggered alongside
  // resetVersion) rebuilds the arrangement from scratch.
  useEffect(() => {
    if (resetVersion > 0) positionsRef.current.clear();
  }, [resetVersion]);

  return (
    <section className="graph-section">
      <div ref={containerRef} className="graph-canvas" />
      {showLegend ? <GraphLegend viewMode={viewMode} /> : null}
    </section>
  );
}

function runLayout(
  cy: cytoscape.Core,
  viewMode: string,
  selectedIds: string[],
  options: { fit?: boolean } = {},
): void {
  const fit = options.fit !== false;
  clearTacticBands(cy);

  if (viewMode === "attack") {
    runAttackFlowLayout(cy, selectedIds, { fitView: fit });
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

  resolveOverlaps(cy, orientation);
  addTacticBands(cy, orientation);
  if (fit) cy.fit(undefined, 48);
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

  resolveOverlaps(cy, orientation);
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

  resolveOverlaps(cy, orientation);
  if (mode === "mitre") {
    addTacticBands(cy, orientation);
  }

  cy.fit(undefined, 48);
}

function clearTacticBands(cy: cytoscape.Core): void {
  cy.nodes(".tactic-band").remove();
}

// Push overlapping nodes apart along the secondary axis so the layout is
// readable. Separating only on the secondary axis keeps the tactic columns
// (primary axis) intact; the graph just grows taller/wider as needed.
function resolveOverlaps(cy: cytoscape.Core, orientation: "horizontal" | "vertical"): void {
  const nodes = cy.nodes().not(".tactic-band").toArray() as cytoscape.NodeSingular[];
  if (nodes.length < 2) return;
  const onY = orientation === "horizontal";
  const pad = 14;
  const boxes = nodes.map((node) => ({
    node,
    halfW: node.width() / 2 + pad,
    halfH: node.height() / 2 + pad,
  }));

  cy.batch(() => {
    for (let iteration = 0; iteration < 200; iteration += 1) {
      let moved = false;
      for (let i = 0; i < boxes.length; i += 1) {
        for (let j = i + 1; j < boxes.length; j += 1) {
          const a = boxes[i];
          const b = boxes[j];
          const ap = a.node.position();
          const bp = b.node.position();
          const overlapX = a.halfW + b.halfW - Math.abs(bp.x - ap.x);
          const overlapY = a.halfH + b.halfH - Math.abs(bp.y - ap.y);
          if (overlapX <= 0 || overlapY <= 0) continue;
          if (onY) {
            const shift = (overlapY / 2 + 0.5) * (bp.y - ap.y < 0 ? -1 : 1);
            a.node.position({ x: ap.x, y: ap.y - shift });
            b.node.position({ x: bp.x, y: bp.y + shift });
          } else {
            const shift = (overlapX / 2 + 0.5) * (bp.x - ap.x < 0 ? -1 : 1);
            a.node.position({ x: ap.x - shift, y: ap.y });
            b.node.position({ x: bp.x + shift, y: bp.y });
          }
          moved = true;
        }
      }
      if (!moved) break;
    }
  });
}

// Remember the current position of every real node (skip tactic bands).
function capturePositions(cy: cytoscape.Core, saved: Map<string, cytoscape.Position>): void {
  cy.nodes().forEach((node) => {
    if (node.hasClass("tactic-band")) return;
    saved.set(node.id(), { ...node.position() });
  });
}

// Place newly revealed nodes near their already-positioned neighbours so they
// don't pile up at the origin, without disturbing existing (dragged) nodes.
function placeNewNodesNearNeighbors(
  cy: cytoscape.Core,
  newNodes: cytoscape.NodeCollection,
  saved: Map<string, cytoscape.Position>,
): void {
  const extent = cy.extent();
  const centerX = (extent.x1 + extent.x2) / 2;
  const centerY = (extent.y1 + extent.y2) / 2;
  newNodes.forEach((node, index) => {
    const neighborPositions = node
      .neighborhood("node")
      .toArray()
      .map((neighbor) => saved.get(neighbor.id()))
      .filter((position): position is cytoscape.Position => Boolean(position));
    if (neighborPositions.length > 0) {
      const x = neighborPositions.reduce((sum, p) => sum + p.x, 0) / neighborPositions.length;
      const y = neighborPositions.reduce((sum, p) => sum + p.y, 0) / neighborPositions.length;
      node.position({ x: x + ((index % 4) - 1.5) * 18, y: y + Math.floor(index / 4) * 18 });
    } else {
      node.position({ x: centerX + index * 18, y: centerY });
    }
  });
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

  // Clip adjacent bands along the primary (column) axis so they never overlap.
  // Only the band rectangles are resized — no node is moved, so manual drag
  // positions are preserved.
  const sorted = [...bandSpecs].sort((a, b) => a.center[primary] - b.center[primary]);
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const a = sorted[i];
    const b = sorted[i + 1];
    const aStart = a.center[primary] - a[sizeKey] / 2;
    const aEnd = a.center[primary] + a[sizeKey] / 2;
    const bStart = b.center[primary] - b[sizeKey] / 2;
    const bEnd = b.center[primary] + b[sizeKey] / 2;
    if (aEnd + bandGap <= bStart) continue;
    const boundary = (aEnd + bStart) / 2;
    a[sizeKey] = Math.max(10, boundary - bandGap / 2 - aStart);
    a.center[primary] = aStart + a[sizeKey] / 2;
    b[sizeKey] = Math.max(10, bEnd - (boundary + bandGap / 2));
    b.center[primary] = bEnd - b[sizeKey] / 2;
  }

  const bandElements = bandSpecs.map((spec) => ({
    data: {
      id: `__tactic_band_${spec.tacticIndex}`,
      entityType: "tactic-band",
      label: spec.tactic,
      width: spec.width,
      height: spec.height,
    },
    position: { ...spec.center },
    classes: "tactic-band",
    selectable: false,
    grabbable: true,
  }));

  const bands = cy.add(bandElements);
  bands.unselectify();
}

function applyHighlight(
  cy: cytoscape.Core,
  selectedIds: string[],
  options?: {
    animateSelection?: boolean;
  },
): void {
  cy.elements().removeClass("selected one-hop two-hop dimmed connected-edge incoming-edge outgoing-edge adjacent-node");
  let selected = cy.collection();
  selectedIds.forEach((id) => {
    const element = cy.getElementById(id);
    if (element.nonempty()) selected = selected.union(element);
  });

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
  if (options?.animateSelection !== false && first.nonempty()) {
    cy.animate({ center: { eles: first }, zoom: Math.max(cy.zoom(), 1.1) }, { duration: 250 });
  }
}


function GraphLegend({ viewMode }: { viewMode: string }) {
  const items = viewMode === "attack"
    ? [
        ["legend-line fact", "Fact condition"],
        ["legend-line", "Dependency"],
        ["legend-line incoming", "Selected incoming"],
        ["legend-line outgoing", "Selected outgoing"],
        ["legend-swatch attack", "Attack node"],
        ["legend-swatch external", "External input"],
        ["legend-swatch and", "AND gate"],
        ["legend-swatch or", "OR gate"],
      ]
    : [
        ["legend-line", "Dependency"],
        ["legend-line member", "Combine member"],
        ["legend-line incoming", "Selected incoming"],
        ["legend-line outgoing", "Selected outgoing"],
        ["legend-swatch attack", "Attack node"],
        ["legend-swatch fact", "Fact"],
        ["legend-swatch external", "External fact"],
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

export const graphStyle = [
  {
    selector: "node",
    style: {
      label: "data(label)",
      "font-size": 10,
      "font-weight": 500,
      "text-valign": "center",
      "text-halign": "center",
      color: "#172033",
      "text-wrap": "wrap",
      "text-max-width": 82,
      width: 92,
      height: 54,
      "background-color": "#f8fafc",
      "border-width": 2,
      "border-color": "#94a3b8",
      "overlay-opacity": 0,
      "z-index": 10,
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
      "text-wrap": "none",
      "text-max-width": 600,
      "text-valign": "top",
      "text-halign": "center",
      "text-margin-y": 10,
      color: "#6b7280",
      "background-color": "#f8fafc",
      "background-opacity": 0.35,
      "border-color": "#94a3b8",
      "border-style": "dashed",
      "border-width": 2,
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
      "text-max-width": 70,
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
      "border-width": 2,
    },
  },
  {
    selector: ".node-hover",
    style: {
      "text-wrap": "wrap",
      "text-max-width": 220,
      "text-background-opacity": 0,
      "z-index": 50,
    },
  },
  {
    selector: ".combine-node",
    style: {
      shape: "diamond",
      width: 62,
      height: 62,
      "font-size": 10,
      "text-max-width": 52,
      "background-color": "#fff7ed",
    },
  },
  {
    selector: ".attack-flow-fact",
    style: {
      width: 90,
      height: 46,
      "font-size": 10,
      "text-max-width": 80,
      "background-color": "#f0fdf4",
      "border-width": 2,
    },
  },
  {
    selector: ".attack-flow-gate",
    style: {
      width: 70,
      height: 70,
      label: "data(label)",
      "text-max-width": 58,
      color: "#18181b",
      "background-color": "#fff7ed",
      "border-width": 2,
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
      "border-width": 2,
    },
  },
  {
    selector: "edge",
    style: {
      label: "data(displayLabel)",
      "font-size": 9,
      color: "#6b7280",
      width: 2,
      "line-color": "#bfc3c9",
      "target-arrow-shape": "triangle",
      "target-arrow-color": "#bfc3c9",
      "curve-style": "bezier",
      "text-background-color": "#ffffff",
      "text-background-opacity": 0.85,
      "text-background-padding": 2,
      "text-rotation": "autorotate",
      "source-text-offset": 18,
      "target-text-offset": 18,
      "z-index": 5,
    },
  },
  {
    selector: ".combine-member-edge",
    style: {
      width: 2,
      "line-style": "dashed",
      "line-color": "#b4b8bf",
      "target-arrow-color": "#b4b8bf",
    },
  },
  {
    selector: ".supports-fact-edge",
    style: {
      width: 3,
      "line-color": "#0d9488",
      "target-arrow-color": "#0d9488",
    },
  },
  {
    selector: ".fact-condition-edge",
    style: {
      width: 3,
      "line-color": "#0d9488",
      "target-arrow-color": "#0d9488",
      color: "#0f766e",
      "font-size": 10,
      "text-background-opacity": 1,
      "z-index": 16,
    },
  },
  {
    selector: ".connected-edge",
    style: {
      width: 5,
      "line-color": "#18181b",
      "target-arrow-color": "#18181b",
      color: "#18181b",
      "font-size": 11,
      "z-index": 18,
    },
  },
  {
    selector: ".incoming-edge",
    style: {
      width: 5,
      "line-color": "#0058cc",
      "target-arrow-color": "#0058cc",
      color: "#0058cc",
      "font-size": 11,
      "z-index": 19,
    },
  },
  {
    selector: ".outgoing-edge",
    style: {
      width: 5,
      "line-color": "#ea580c",
      "target-arrow-color": "#ea580c",
      color: "#ea580c",
      "font-size": 11,
      "z-index": 19,
    },
  },
  {
    selector: ".edge-hover",
    style: {
      width: 5,
      "line-color": "#0d9488",
      "target-arrow-color": "#0d9488",
      color: "#0d9488",
      "font-size": 12,
      "text-background-opacity": 1,
      "z-index": 24,
    },
  },
  {
    selector: ".selected",
    style: {
      "border-width": 6,
      "z-index": 20,
    },
  },
  {
    selector: ".adjacent-node",
    style: {
      "border-width": 4,
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
] as cytoscape.CytoscapeOptions["style"];
