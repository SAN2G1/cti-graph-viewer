import { useGraphStore } from "../store/graphStore";
import type { GraphDiagnostic } from "../types/graph";

const checkLabels: Record<GraphDiagnostic["checkNo"], string> = {
  "0": "헤더 일치",
  "1": "형식",
  "1b": "관계식 동사·형식",
  "2": "참조 무결성",
  "3": "producers ↔ parsers",
  "3b": "requirements ↔ consumers",
  "4": "Combine 구조",
  "5": "외부 입력 일관성",
  "6": "도달 가능성",
  "7": "기법 GT 비교",
};

export function DiagnosticsPanel() {
  const parsed = useGraphStore((state) => state.parsed);
  const selectedDiagnostic = useGraphStore((state) => state.selectedDiagnostic);
  const setSelectedDiagnostic = useGraphStore((state) => state.setSelectedDiagnostic);

  if (!parsed) return <section className="diagnostics-panel"><h2>Diagnostics</h2><p>No diagnostics yet.</p></section>;

  const grouped = parsed.diagnostics.reduce<Record<string, GraphDiagnostic[]>>((acc, diagnostic) => {
    acc[diagnostic.checkNo] = [...(acc[diagnostic.checkNo] ?? []), diagnostic];
    return acc;
  }, {});
  const checkNos = Object.keys(checkLabels) as GraphDiagnostic["checkNo"][];

  return (
    <section className="diagnostics-panel">
      <h2>Diagnostics</h2>
      <div className="diagnostic-groups">
        {checkNos.map((checkNo) => {
          const diagnostics = grouped[checkNo] ?? [];
          const failures = diagnostics.filter((diagnostic) => diagnostic.severity !== "info");
          return (
            <div className="diagnostic-group" key={checkNo}>
              <div className="diagnostic-group-title">
                <span>[{checkNo}] {checkLabels[checkNo]}</span>
                <strong>{failures.length === 0 ? "PASS" : `FAIL ${failures.length}`}</strong>
              </div>
              {diagnostics.map((diagnostic) => (
                <button
                  key={diagnostic.id}
                  type="button"
                  className={`diagnostic-item severity-${diagnostic.severity} ${selectedDiagnostic?.id === diagnostic.id ? "active" : ""}`}
                  onClick={() => setSelectedDiagnostic(diagnostic)}
                >
                  <span>{diagnostic.severity.toUpperCase()}</span>
                  <span>
                    <span>{diagnostic.message}</span>
                    <span className="diagnostic-meta">{formatRowRefs(diagnostic.rowRefs)}</span>
                  </span>
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function formatRowRefs(rowRefs: GraphDiagnostic["rowRefs"]): string {
  if (!rowRefs || rowRefs.length === 0) return "Location unavailable";
  return rowRefs
    .map((rowRef) => `${rowRef.table.toUpperCase()} row ${rowRef.rowIndex + 1}${rowRef.column ? ` · ${rowRef.column}` : ""}`)
    .join(" / ");
}
