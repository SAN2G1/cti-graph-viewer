import { DetailPanel } from "./components/DetailPanel";
import { DiagnosticsPanel } from "./components/DiagnosticsPanel";
import { GraphCanvas } from "./components/GraphCanvas";
import { SummaryBar } from "./components/SummaryBar";
import { Toolbar } from "./components/Toolbar";

export default function App() {
  return (
    <div className="app-shell">
      <Toolbar />
      <SummaryBar />
      <main className="workspace">
        <GraphCanvas />
        <DetailPanel />
      </main>
      <DiagnosticsPanel />
    </div>
  );
}
