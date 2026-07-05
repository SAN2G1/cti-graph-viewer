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
  const fitVersion = useGraphStore((state) => state.fitVersion);
  const resetVersion = useGraphStore((state) => state.resetVersion);
  const showLegend = useGraphStore((state) => state.showLegend);
  const magnifier = useGraphStore((state) => state.magnifier);
  const setCy = useGraphStore((state) => state.setCy);
  const setSelectedIds = useGraphStore((state) => state.setSelectedIds);
  // Preserve manual positions across search/filter rebuilds.
  const positionsRef = useRef<Map<string, cytoscape.Position>>(new Map());
  const prevParsedRef = useRef(parsed);
  const loupeRef = useRef<HTMLDivElement | null>(null);
  const loupeCanvasRef = useRef<HTMLCanvasElement | null>(null);

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

    // Reveal the full label while hovering truncated nodes.
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

    // Dragging a tactic band moves its member attack nodes with it.
    let dragBand: { last: cytoscape.Position; members: cytoscape.NodeCollection } | null = null;

    cy.on("grab", "node", (event) => {
      const node = event.target;
      if (node.hasClass("tactic-band")) {
        const tactic = node.data("label") as string;
        dragBand = {
          last: { ...node.position() },
          members: cy.nodes(".attack-node").filter((member) => member.data("tactic") === tactic),
        };
        return;
      }
      dragBand = null;
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
      // Attack nodes drag freely; their tactic band resizes around them.
      if (node.hasClass("attack-node")) resizeTacticBandForNode(cy, node);
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
      if (node.hasClass("attack-node")) resizeTacticBandForNode(cy, node);
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

    // A new dataset invalidates remembered positions.
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
        // Search/filter changes keep existing positions and place only new nodes.
        if (newNodes.nonempty()) placeNewNodesNearNeighbors(cy, newNodes, saved);
        if (hadBands) {
          const orientation = cy.width() >= cy.height() ? "horizontal" : "vertical";
          addTacticBands(cy, orientation);
        }
      }
      capturePositions(cy, saved);
    }

    previousViewModeRef.current = viewMode;
    // Highlight after rebuild; selection owns the pan/center animation.
    applyHighlight(cy, selectedIds, { animateSelection: false });
  }, [elements, viewMode, parsed]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    // Selection should not re-run layout.
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
    runFlowLayout(cy);
    capturePositions(cy, positionsRef.current);
  }, [flowLayoutVersion]);

  useEffect(() => {
    const cy = cyRef.current;
    if (cy && fitVersion > 0) cy.fit(undefined, 36);
  }, [fitVersion]);

  // Reset discards manual drag positions.
  useEffect(() => {
    if (resetVersion > 0) positionsRef.current.clear();
  }, [resetVersion]);

  // The loupe samples a high-res snapshot so labels stay readable.
  useEffect(() => {
    const container = containerRef.current;
    const loupe = loupeRef.current;
    const lcanvas = loupeCanvasRef.current;
    if (!container || !loupe || !lcanvas) return;
    if (!magnifier) {
      loupe.style.display = "none";
      return;
    }
    const ctx = lcanvas.getContext("2d");
    if (!ctx) return;
    const D = lcanvas.width;
    const TARGET_ZOOM = 1.3; // loupe shows the graph as if at this zoom (readable)

    const snapshot = { img: null as HTMLImageElement | null };
    const capture = () => {
      const cy = cyRef.current;
      if (!cy || cy.elements().empty()) return;
      const scale = Math.min(6, Math.max(2.5, TARGET_ZOOM / (cy.zoom() || 1)));
      try {
        const uri = cy.png({ output: "base64uri", bg: "#ffffff", full: false, scale });
        const img = new Image();
        img.onload = () => {
          snapshot.img = img;
        };
        img.src = uri;
      } catch {
        // png can fail transiently; keep the previous snapshot
      }
    };
    let captureTimer: number | null = null;
    const scheduleCapture = () => {
      if (captureTimer != null) window.clearTimeout(captureTimer);
      captureTimer = window.setTimeout(capture, 150);
    };

    capture();
    const cy = cyRef.current;
    cy?.on("pan zoom add remove free layoutstop", scheduleCapture);

    const draw = (clientX: number, clientY: number) => {
      const img = snapshot.img;
      const rect = container.getBoundingClientRect();
      const cssX = clientX - rect.left;
      const cssY = clientY - rect.top;
      if (!img || cssX < 0 || cssY < 0 || cssX > rect.width || cssY > rect.height) {
        loupe.style.display = "none";
        return;
      }
      // Map cursor coordinates into the high-res snapshot.
      const mag = container.clientWidth > 0 ? img.width / container.clientWidth : 1;
      const sx = cssX * mag - D / 2;
      const sy = cssY * mag - D / 2;
      ctx.clearRect(0, 0, D, D);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, D, D);
      ctx.drawImage(img, sx, sy, D, D, 0, 0, D, D);
      const dCss = loupe.offsetWidth || D;
      const off = 24;
      // Default to the upper-left of the pointer; flip if it would clip.
      let lx = cssX - off - dCss;
      let ly = cssY - off - dCss;
      if (lx < 0) lx = cssX + off;
      if (ly < 0) ly = cssY + off;
      if (lx + dCss > rect.width) lx = rect.width - dCss;
      if (ly + dCss > rect.height) ly = rect.height - dCss;
      loupe.style.left = `${Math.max(0, lx)}px`;
      loupe.style.top = `${Math.max(0, ly)}px`;
      loupe.style.display = "block";
    };

    const onMove = (event: MouseEvent) => draw(event.clientX, event.clientY);
    const onLeave = () => {
      loupe.style.display = "none";
    };
    container.addEventListener("mousemove", onMove);
    container.addEventListener("mouseleave", onLeave);
    return () => {
      if (captureTimer != null) window.clearTimeout(captureTimer);
      cy?.off("pan zoom add remove free layoutstop", scheduleCapture);
      container.removeEventListener("mousemove", onMove);
      container.removeEventListener("mouseleave", onLeave);
      loupe.style.display = "none";
    };
  }, [magnifier]);

  return (
    <section className="graph-section" style={{ position: "relative" }}>
      <div ref={containerRef} className="graph-canvas" />
      <div
        ref={loupeRef}
        style={{
          position: "absolute",
          display: "none",
          width: 220,
          height: 220,
          borderRadius: "50%",
          overflow: "hidden",
          border: "2px solid #475569",
          boxShadow: "0 6px 18px rgba(15,23,42,0.3)",
          pointerEvents: "none",
          zIndex: 30,
          background: "#fff",
        }}
      >
        <canvas
          ref={loupeCanvasRef}
          width={220}
          height={220}
          style={{ width: "100%", height: "100%", display: "block" }}
        />
      </div>
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

function runFlowLayout(cy: cytoscape.Core): void {
  clearTacticBands(cy);
  const orientation = cy.width() >= cy.height() ? "horizontal" : "vertical";
  const positions = buildDirectedFlowLayout(cy, orientation);

  cy.batch(() => {
    for (const [id, position] of positions) {
      const node = cy.getElementById(id);
      if (node.nonempty()) node.position(position);
    }
  });

  resolveOverlaps(cy, orientation);
  cy.fit(undefined, 48);
}

function clearTacticBands(cy: cytoscape.Core): void {
  cy.nodes(".tactic-band").remove();
}

// Separate overlaps without changing the primary tactic axis.
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

// Place newly revealed nodes near positioned neighbours.
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

// Tactic band inner padding.
const BAND_PADDING_X = 86;
const BAND_PADDING_Y = 76;

// Keep a tactic band wrapped around its member nodes.
function resizeTacticBandForNode(cy: cytoscape.Core, node: cytoscape.NodeSingular): void {
  const tactic = node.data("tactic") as string | undefined;
  if (!tactic) return;
  const band = cy.nodes(".tactic-band").filter((b) => b.data("label") === tactic);
  if (band.empty()) return;
  const members = cy.nodes(".attack-node").filter((member) => member.data("tactic") === tactic);
  if (members.empty()) return;
  const bb = members.boundingBox({ includeLabels: true, includeOverlays: false });
  const b = band.first() as cytoscape.NodeSingular;
  b.data("width", bb.x2 - bb.x1 + BAND_PADDING_X * 2);
  b.data("height", bb.y2 - bb.y1 + BAND_PADDING_Y * 2);
  b.position({ x: (bb.x1 + bb.x2) / 2, y: (bb.y1 + bb.y2) / 2 });
}

function addTacticBands(cy: cytoscape.Core, orientation: "horizontal" | "vertical"): void {
  const paddingX = BAND_PADDING_X;
  const paddingY = BAND_PADDING_Y;
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
    const width = maxX - minX;
    const height = maxY - minY;
    const center = {
      x: minX + width / 2,
      y: minY + height / 2,
    };
    bandSpecs.push({ tactic, tacticIndex, tacticNodes, center, width, height });
  });

  if (bandSpecs.length === 0) return;

  const primary = orientation === "horizontal" ? "x" : "y";
  const sizeKey = orientation === "horizontal" ? "width" : "height";

  // Clip adjacent bands without moving nodes.
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
      "font-size": 24,
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
