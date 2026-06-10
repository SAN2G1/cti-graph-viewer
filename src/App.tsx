import { useEffect } from "react";
import { useGtStore } from "./gt/gtStore";
import { TopBar } from "./gt/components/TopBar";
import { TabBar } from "./gt/components/TabBar";
import { NodeVerificationTab } from "./gt/components/NodeVerificationTab";
import { FactsTab } from "./gt/components/FactsTab";
import { DiagramTab } from "./gt/components/DiagramTab";
import { HelpPage } from "./components/HelpPage";

export default function App() {
  const activeTab = useGtStore((state) => state.activeTab);
  const helpOpen = useGtStore((state) => state.helpOpen);

  // Left/Right arrows step through nodes (when not typing in a field).
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName || "").toUpperCase();
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const store = useGtStore.getState();
      if (event.key === "ArrowLeft") {
        store.navigateNode(-1);
        event.preventDefault();
      } else if (event.key === "ArrowRight") {
        store.navigateNode(1);
        event.preventDefault();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const showTab = (tab: string) => !helpOpen && activeTab === tab;

  return (
    <div id="app">
      <TopBar />
      <TabBar />
      {/* Tabs stay mounted (CSS-hidden) so the cytoscape instance survives. */}
      <NodeVerificationTab active={showTab("nodes")} />
      <FactsTab active={showTab("facts")} />
      <DiagramTab active={showTab("diagram")} />
      {helpOpen ? <HelpPage /> : null}
    </div>
  );
}
