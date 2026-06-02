import { DetailPanel } from "./components/DetailPanel";
import { DiagnosticsPanel } from "./components/DiagnosticsPanel";
import { GraphCanvas } from "./components/GraphCanvas";
import { HelpPage } from "./components/HelpPage";
import { SummaryBar } from "./components/SummaryBar";
import { Toolbar } from "./components/Toolbar";
import { useGraphStore } from "./store/graphStore";

export default function App() {
  const screen = useGraphStore((state) => state.screen);

  return (
    <div className={`app-shell ${screen === "help" ? "app-shell-help" : ""}`}>
      <Toolbar />
      {screen === "viewer" ? (
        <>
          <SummaryBar />
          <main className="workspace">
            <GraphCanvas />
            <DetailPanel />
          </main>
          <DiagnosticsPanel />
        </>
      ) : (
        <HelpPage />
      )}
    </div>
  );
}
