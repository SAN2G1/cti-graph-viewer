import { useEffect, useMemo, useRef } from "react";
import cytoscape from "cytoscape";
import fcose from "cytoscape-fcose";
import { useGraphStore } from "../store/graphStore";
import { buildCytoscapeElements } from "../utils/graphBuilder";
import { buildDirectedFlowLayout } from "../utils/graphAlgorithms";
import { ALLOWED_TACTICS } from "../constants/allowedValues";

cytoscape.use(fcose);

export function GraphCanvas() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  const didRunInitialLayoutRef = useRef(false);
  const previousViewModeRef = useRef<string | null>(null);
  const dragFollowRef = useRef<{
    lastPosition: cytoscape.Position;
    levels: Array<{
      nodes: cytoscape.NodeCollection;
      factor: number;
    }>;
    pendingDelta: cytoscape.Position;
    frameId: number | null;
    active: boolean;
  } | null>(null);
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
      autoungrabify: false,
    });
    cy.on("tap", "node", (event) => {
      if (event.target.hasClass("tactic-band")) return;
      setSelectedIds([event.target.id()]);
    });
    cy.on("tap", (event) => {
      if (event.target === cy) setSelectedIds([]);
    });
    const setupDragFollow = (event: cytoscape.EventObject) => {
      const node = event.target;
      if (node.hasClass("tactic-band")) return;
      dragFollowRef.current = {
        lastPosition: { ...node.position() },
        levels: collectDownstreamLevels(node, 5),
        pendingDelta: { x: 0, y: 0 },
        frameId: null,
        active: true,
      };
    };
    cy.on("grab", "node", setupDragFollow);
    cy.on("grabon", "node", setupDragFollow);
    cy.on("drag", "node", (event) => {
      const follow = dragFollowRef.current;
      if (!follow) return;
      const node = event.target;
      if (node.hasClass("tactic-band")) return;
      clampNodeToTacticBand(node);
      const position = node.position();
      const delta = {
        x: position.x - follow.lastPosition.x,
        y: position.y - follow.lastPosition.y,
      };
      if (Math.abs(delta.x) < 0.01 && Math.abs(delta.y) < 0.01) return;

      follow.pendingDelta.x += delta.x;
      follow.pendingDelta.y += delta.y;
      follow.lastPosition = { ...position };
      scheduleDragFollowFrame(cy, dragFollowRef);
    });
    const clearDragFollow = () => {
      if (dragFollowRef.current) dragFollowRef.current.active = false;
    };
    cy.on("free", "node", clearDragFollow);
    cy.on("freeon", "node", clearDragFollow);
    cy.on("dragfree", "node", clearDragFollow);
    cy.on("dragfreeon", "node", clearDragFollow);
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
    cy.nodes().grabify();
    const viewModeChanged = previousViewModeRef.current !== viewMode;
    if (cy.nodes().length > 0 && (!didRunInitialLayoutRef.current || positionedNodeCount === 0 || viewModeChanged)) {
      runLayout(cy);
      didRunInitialLayoutRef.current = true;
    }
    previousViewModeRef.current = viewMode;
    applyHighlight(cy, selectedIds, viewMode, parsed?.diagnostics ?? []);
  }, [elements, parsed?.diagnostics, viewMode]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    applyHighlight(cy, selectedIds, viewMode, parsed?.diagnostics ?? []);
  }, [selectedIds, viewMode, parsed?.diagnostics]);

  useEffect(() => {
    const cy = cyRef.current;
    if (cy && layoutVersion > 0) runLayout(cy);
  }, [layoutVersion]);

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
    </section>
  );
}

function runLayout(cy: cytoscape.Core): void {
  clearTacticBands(cy);
  cy.layout({
    name: "fcose",
    animate: false,
    fit: true,
    padding: 44,
    nodeDimensionsIncludeLabels: true,
    idealEdgeLength: 92,
    nodeRepulsion: 4200,
    nodeSeparation: 32,
    nestingFactor: 0.8,
    gravity: 0.36,
    gravityRange: 3.2,
  } as cytoscape.LayoutOptions).run();
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
  cy.nodes().forEach((node) => {
    node.scratch("_tacticBounds", undefined);
  });
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

    const tacticBounds = {
      minX: spec.center.x - spec.width / 2 + 52,
      maxX: spec.center.x + spec.width / 2 - 52,
      minY: spec.center.y - spec.height / 2 + 42,
      maxY: spec.center.y + spec.height / 2 - 42,
    };
    spec.tacticNodes.forEach((node) => {
      node.scratch("_tacticBounds", tacticBounds);
    });

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

function collectDownstreamLevels(
  startNode: cytoscape.NodeSingular,
  maxDepth: number,
): Array<{ nodes: cytoscape.NodeCollection; factor: number }> {
  const factors = [0.28, 0.18, 0.12, 0.08, 0.05];
  const cy = startNode.cy();
  const levels: Array<{ nodes: cytoscape.NodeCollection; factor: number }> = [];
  let frontier: cytoscape.NodeCollection = cy.collection(startNode);
  let visited: cytoscape.CollectionReturnValue = cy.collection(startNode);

  for (let depth = 0; depth < maxDepth; depth += 1) {
    const next = outgoingTargets(frontier).difference(visited);
    if (next.empty()) break;
    levels.push({ nodes: next, factor: factors[depth] ?? 0.04 });
    visited = visited.union(next);
    frontier = next;
  }

  return levels;
}

function outgoingTargets(nodes: cytoscape.NodeCollection): cytoscape.NodeCollection {
  const sourceIds = new Set<string>();
  nodes.forEach((node) => {
    sourceIds.add(node.id());
  });

  return nodes
    .connectedEdges()
    .filter((edge: cytoscape.EdgeSingular) => sourceIds.has(edge.source().id()))
    .targets();
}

function scheduleDragFollowFrame(
  cy: cytoscape.Core,
  dragFollowRef: React.MutableRefObject<{
    lastPosition: cytoscape.Position;
    levels: Array<{ nodes: cytoscape.NodeCollection; factor: number }>;
    pendingDelta: cytoscape.Position;
    frameId: number | null;
    active: boolean;
  } | null>,
): void {
  const follow = dragFollowRef.current;
  if (!follow || follow.frameId !== null) return;

  follow.frameId = window.requestAnimationFrame(() => {
    const currentFollow = dragFollowRef.current;
    if (!currentFollow) return;
    currentFollow.frameId = null;

    const step = {
      x: currentFollow.pendingDelta.x * 0.42,
      y: currentFollow.pendingDelta.y * 0.42,
    };
    currentFollow.pendingDelta.x -= step.x;
    currentFollow.pendingDelta.y -= step.y;

    if (Math.abs(step.x) >= 0.02 || Math.abs(step.y) >= 0.02) {
      cy.batch(() => {
        for (const level of currentFollow.levels) {
          moveNodes(level.nodes, step, level.factor);
        }
      });
    }

    const hasPending = Math.abs(currentFollow.pendingDelta.x) >= 0.03 || Math.abs(currentFollow.pendingDelta.y) >= 0.03;
    if (hasPending) {
      scheduleDragFollowFrame(cy, dragFollowRef);
    } else if (!currentFollow.active) {
      dragFollowRef.current = null;
    }
  });
}

function moveNodes(nodes: cytoscape.NodeCollection, delta: cytoscape.Position, factor: number): void {
  nodes.forEach((node) => {
    if (node.grabbed()) return;
    const position = node.position();
    node.position({
      x: position.x + delta.x * factor,
      y: position.y + delta.y * factor,
    });
    clampNodeToTacticBand(node);
  });
}

function clampNodeToTacticBand(node: cytoscape.NodeSingular): void {
  const bounds = node.scratch("_tacticBounds") as
    | { minX: number; maxX: number; minY: number; maxY: number }
    | undefined;
  if (!bounds) return;

  const position = node.position();
  const nextPosition = {
    x: Math.min(bounds.maxX, Math.max(bounds.minX, position.x)),
    y: Math.min(bounds.maxY, Math.max(bounds.minY, position.y)),
  };
  if (nextPosition.x !== position.x || nextPosition.y !== position.y) {
    node.position(nextPosition);
  }
}


function applyHighlight(
  cy: cytoscape.Core,
  selectedIds: string[],
  viewMode: string,
  diagnostics: import("../types/graph").GraphDiagnostic[],
): void {
  cy.elements().removeClass("selected one-hop two-hop dimmed diagnostic-focus connected-edge adjacent-node");
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
  const adjacentNodes = connectedEdges.connectedNodes().difference(selected);
  const oneHop = selected.neighborhood();
  const twoHop = oneHop.neighborhood().difference(selected).difference(oneHop);
  cy.elements().difference(selected.union(oneHop).union(twoHop).union(connectedEdges).union(adjacentNodes)).addClass("dimmed");
  selected.addClass("selected");
  adjacentNodes.addClass("adjacent-node");
  connectedEdges.addClass("connected-edge");
  oneHop.addClass("one-hop");
  twoHop.addClass("two-hop");

  const first = selected.first();
  if (first.nonempty()) cy.animate({ center: { eles: first }, zoom: Math.max(cy.zoom(), 1.1) }, { duration: 250 });
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
      width: 74,
      height: 74,
      "background-color": "#fff7ed",
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
    },
  },
  {
    selector: ".combine-member-edge",
    style: {
      "line-style": "dashed",
      "line-color": "#9a3412",
      "target-arrow-color": "#9a3412",
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
