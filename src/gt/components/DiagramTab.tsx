import { useEffect, useRef, useState } from "react";
import type { ParsedWorkbook } from "../../types/graph";
import { DetailPanel } from "../../components/DetailPanel";
import { GraphCanvas } from "../../components/GraphCanvas";
import { SummaryBar } from "../../components/SummaryBar";
import { Toolbar } from "../../components/Toolbar";
import { useGraphStore } from "../../store/graphStore";
import { MermaidDiagram } from "./MermaidDiagram";

type DiagramView = "graph" | "flow";

// One Diagram tab, two representations of the same data switched with a toggle.
// Both stay mounted (CSS-hidden) so the cytoscape instance survives switching.
export function DiagramTab({ active }: { active: boolean }) {
  const [view, setView] = useState<DiagramView>("graph");
  const cy = useGraphStore((state) => state.cy);
  const parsed = useGraphStore((state) => state.parsed);
  const requestLayout = useGraphStore((state) => state.requestLayout);
  const laidOutForRef = useRef<ParsedWorkbook | null>(null);

  const graphVisible = active && view === "graph";

  useEffect(() => {
    if (!graphVisible || !cy) return;
    cy.resize();
    if (parsed && laidOutForRef.current !== parsed) {
      laidOutForRef.current = parsed;
      requestLayout();
    } else if (cy.elements().nonempty()) {
      cy.fit(undefined, 48);
    }
  }, [graphVisible, cy, parsed, requestLayout]);

  return (
    <div className={`tab-pane${active ? " active" : ""}`} id="tab-diagram">
      <div className="diagram-graph-embed">
        <div className="diagram-switch">
          <button type="button" className={view === "graph" ? "active" : ""} onClick={() => setView("graph")}>
            Graph
          </button>
          <button type="button" className={view === "flow" ? "active" : ""} onClick={() => setView("flow")}>
            Flow
          </button>
        </div>

        <div className={`diagram-view${view === "graph" ? "" : " is-hidden"}`}>
          <Toolbar />
          <SummaryBar />
          <main className="workspace diagram-workspace">
            <GraphCanvas />
            <DetailPanel />
          </main>
        </div>

        <div className={`diagram-view diagram-view-flow${view === "flow" ? "" : " is-hidden"}`}>
          <MermaidDiagram />
        </div>
      </div>
    </div>
  );
}
