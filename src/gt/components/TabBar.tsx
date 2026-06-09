import { countNotes, useGtStore } from "../gtStore";
import type { GtTab } from "../types";

const TABS: Array<{ id: GtTab; label: string }> = [
  { id: "nodes", label: "Nodes" },
  { id: "facts", label: "Facts" },
  { id: "diagram", label: "Diagram" },
];

export function TabBar() {
  const data = useGtStore((s) => s.data);
  const activeTab = useGtStore((s) => s.activeTab);
  const setActiveTab = useGtStore((s) => s.setActiveTab);
  const nodeNotes = useGtStore((s) => s.nodeNotes);
  const factNotes = useGtStore((s) => s.factNotes);

  const nodeCount = data?.nodes.length ?? 0;
  const factCount = data ? Object.keys(data.facts || {}).length : 0;
  const nodeNoteCount = countNotes(nodeNotes);
  const factNoteCount = countNotes(factNotes);

  const badge = (tab: GtTab): number | null => {
    if (tab === "nodes") return nodeNoteCount || nodeCount;
    if (tab === "facts") return factNoteCount || factCount;
    return null;
  };

  return (
    <div id="tabbar">
      {TABS.map((tab) => {
        const count = badge(tab.id);
        return (
          <button
            key={tab.id}
            type="button"
            className={`tab-btn${activeTab === tab.id ? " active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
            {count != null && data ? <span className="tab-badge">{count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
