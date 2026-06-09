import { useEffect, useMemo, useRef } from "react";
import cytoscape from "cytoscape";
import { useGraphStore } from "../../store/graphStore";
import { buildCytoscapeElements } from "../../utils/graphBuilder";
import { graphStyle } from "../../components/GraphCanvas";

// Compact, non-interactive dependency view for the currently selected node:
// the node plus its 2-hop neighbourhood, drawn with the shared graph styles.
// Direction is meaningful — what the node consumes (its inputs) is laid out
// above it, what it produces (its outputs) below it.
export function NodeDependencyGraph({ nodeId }: { nodeId: string }) {
  const parsed = useGraphStore((state) => state.parsed);
  const containerRef = useRef<HTMLDivElement>(null);

  const graph = useMemo(() => {
    const empty = { elements: [] as cytoscape.ElementDefinition[], levels: new Map<string, number>(), nodeCount: 0 };
    if (!parsed) return empty;

    const all = buildCytoscapeElements(parsed, { viewMode: "full" });
    const isEdge = (el: cytoscape.ElementDefinition) => Boolean((el.data as { source?: string }).source);
    const edges = all.filter(isEdge);
    const nodesById = new Map(
      all.filter((el) => !isEdge(el)).map((el) => [String((el.data as { id: string }).id), el]),
    );

    // succ: source -> targets (downstream, "produced" direction)
    // pred: target -> sources (upstream, "consumed" direction)
    const succ = new Map<string, string[]>();
    const pred = new Map<string, string[]>();
    const addAdj = (map: Map<string, string[]>, key: string, value: string) => {
      const arr = map.get(key);
      if (arr) arr.push(value);
      else map.set(key, [value]);
    };
    for (const edge of edges) {
      const { source, target } = edge.data as { source: string; target: string };
      addAdj(succ, source, target);
      addAdj(pred, target, source);
    }

    // Signed BFS level: negative = consumed (above), positive = produced (below).
    const levels = new Map<string, number>([[nodeId, 0]]);
    const expand = (adjacency: Map<string, string[]>, sign: number) => {
      let frontier = [nodeId];
      for (let hop = 1; hop <= 2; hop += 1) {
        const next: string[] = [];
        for (const id of frontier) {
          for (const neighbor of adjacency.get(id) ?? []) {
            if (!levels.has(neighbor)) {
              levels.set(neighbor, sign * hop);
              next.push(neighbor);
            }
          }
        }
        frontier = next;
      }
    };
    expand(pred, -1); // consumed inputs go up
    expand(succ, 1); // produced outputs go down

    const keptIds = new Set(levels.keys());
    const keptNodes = [...keptIds].map((id) => nodesById.get(id)).filter(Boolean) as cytoscape.ElementDefinition[];
    const keptEdges = edges.filter((edge) => {
      const { source, target } = edge.data as { source: string; target: string };
      return keptIds.has(source) && keptIds.has(target);
    });

    return { elements: [...keptNodes, ...keptEdges], levels, nodeCount: keptNodes.length };
  }, [parsed, nodeId]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || graph.elements.length === 0) return;

    const cy = cytoscape({
      container,
      elements: graph.elements,
      style: [
        ...(graphStyle as unknown as Array<Record<string, unknown>>),
        // Sized for the compact panel — large enough to read, small enough to fit.
        { selector: "node", style: { width: 74, height: 48, "font-size": 11, "text-max-width": 68 } },
        { selector: ".fact-node", style: { width: 68, height: 44, "text-max-width": 60 } },
        { selector: ".combine-node", style: { width: 58, height: 58, "text-max-width": 50 } },
        { selector: ".selected", style: { "border-width": 4 } },
        // Drop edge labels — the panel is too small for them.
        { selector: "edge", style: { label: "", width: 2 } },
      ] as unknown as cytoscape.CytoscapeOptions["style"],
      userZoomingEnabled: false,
      userPanningEnabled: false,
      boxSelectionEnabled: false,
      autoungrabify: true,
    });

    cy.getElementById(nodeId).addClass("selected");

    // Lay out by signed level: consumed inputs above (negative y), produced
    // outputs below (positive y). Positions are assigned by hand so the result
    // is deterministic and independent of container size / layout timing.
    const placeAndFit = () => {
      const byLevel = new Map<number, string[]>();
      for (const [id, level] of graph.levels) {
        const row = byLevel.get(level);
        if (row) row.push(id);
        else byLevel.set(level, [id]);
      }
      const vGap = 124;
      const hGap = 112;
      for (const [level, ids] of byLevel) {
        ids.forEach((id, index) => {
          const x = (index - (ids.length - 1) / 2) * hGap;
          const y = level * vGap;
          cy.getElementById(id).position({ x, y });
        });
      }
      cy.resize();
      cy.fit(undefined, 24);
    };

    placeAndFit();

    // The panel can mount while its tab is hidden (0×0), which leaves the canvas
    // blank. Re-fit whenever the container gains/changes size.
    const observer = new ResizeObserver(placeAndFit);
    observer.observe(container);

    return () => {
      observer.disconnect();
      cy.destroy();
    };
  }, [graph, nodeId]);

  if (!parsed) {
    return <span className="empty-state">Load data to see dependencies</span>;
  }
  if (graph.nodeCount <= 1) {
    return <span className="empty-state">No direct dependencies</span>;
  }
  return <div ref={containerRef} className="node-dep-graph" />;
}
