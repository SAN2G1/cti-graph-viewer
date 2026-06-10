import { useState, type ReactNode } from "react";

type SectionDef = {
  id: string;
  label: string;
  title: string;
  note?: string;
  content: ReactNode;
};

const SECTIONS: SectionDef[] = [
  {
    id: "concepts",
    label: "Concepts",
    title: "Concepts",
    note: "Core terms, based on the MITRE ATT&CK framework",
    content: (
      <HelpList
        items={[
          [
            "Node",
            "A single step of the attack — one MITRE ATT&CK technique applied at a specific point. Each node carries its ATT&CK technique ID (e.g. T1059), the technique name, and the tactic it serves, along with the facts it requires and produces.",
          ],
          [
            "Fact",
            "A premise the attack depends on: an observation, artifact, or condition that must hold for a technique to work. Facts are produced by some nodes and consumed by others, which is what links the techniques into a dependency chain.",
          ],
          [
            "Combine",
            "A logical grouping of several facts with an AND / OR operator. It expresses a compound precondition — for example, two facts that must both be true (AND), or either one (OR) — that a node needs before it can run.",
          ],
          [
            "Tactic",
            "The adversary's tactical goal in MITRE ATT&CK — the \"why\" behind a technique (e.g. Initial Access, Execution, Persistence). Nodes are grouped by the tactic they advance, giving the high-level stages of the attack.",
          ],
        ]}
      />
    ),
  },
  {
    id: "data",
    label: "Data",
    title: "Data & files",
    note: "What you load in, and what you get out",
    content: (
      <>
        <h4 className="help-subhead">Load (Input)</h4>
        <HelpList
          items={[
            [
              "node.xlsx, fact.xlsx, combine.xlsx",
              "The three answer-sheet tables (required). Press Load in the top bar, pick all three, and the viewer builds its node / fact / combine data from them in the browser — no separate script or JSON step.",
            ],
            [
              "Report PDF",
              "The original report (required). Page text is extracted for the Text view, and referenced pages are rendered to images for the Image view automatically.",
            ],
            [
              "Page offset",
              "Optional. Set it in the Load dialog when the printed page numbers differ from the physical PDF pages (printed = physical − offset), e.g. because of a cover page.",
            ],
            [
              "Notes file",
              "Optional. Use Import to load a previously exported notes JSON and restore your annotations onto the matching nodes and facts.",
            ],
          ]}
        />
        <h4 className="help-subhead">Save (Output)</h4>
        <HelpList
          items={[
            [
              "Notes JSON",
              "Saves all node and fact notes to a JSON file that can be re-imported later to continue where you left off.",
            ],
            [
              "Notes CSV",
              "Saves node notes as a spreadsheet-friendly CSV for review or reporting outside the viewer.",
            ],
          ]}
        />
      </>
    ),
  },
  {
    id: "nodes",
    label: "Nodes",
    title: "Nodes tab",
    note: "Everything known about one technique",
    content: (
      <HelpList
        items={[
          [
            "Identity",
            "The technique's ATT&CK ID and name, the tactic it serves, and a short summary of the behavior.",
          ],
          [
            "Requirements",
            "The facts the technique needs before it can run, grouped by the AND / OR conditions that combine them.",
          ],
          [
            "Parsers & Relationships",
            "Parser facts linked to the technique (inferred ones are flagged) and statements of how it relates to other facts and nodes.",
          ],
          [
            "Dependency",
            "A focused mini-graph of just this node and the facts, conditions, and nodes directly connected to it.",
          ],
          ["Report Pages", "The source report pages the technique is based on, as text or page image."],
          ["Note", "Your own annotation for the node, included when you export notes."],
        ]}
      />
    ),
  },
  {
    id: "facts",
    label: "Facts",
    title: "Facts tab",
    note: "What a fact is and where it comes from",
    content: (
      <HelpList
        items={[
          [
            "Producers & Consumers",
            "Which nodes generate the fact and which nodes rely on it — how the fact links techniques together.",
          ],
          [
            "is_external",
            "Whether the fact is an external input the attack assumes, or something produced during the attack.",
          ],
          ["Inferred", "Facts not stated explicitly in the report but reasoned from it are flagged as inferred."],
          ["Report Pages", "The source report pages where the fact appears, as text or page image."],
          ["Note", "Your own annotation for the fact, included when you export notes."],
        ]}
      />
    ),
  },
  {
    id: "diagram",
    label: "Diagram",
    title: "Diagram tab",
    note: "A visual map of the whole attack",
    content: (
      <>
        <h4 className="help-subhead">Graph</h4>
        <HelpList
          items={[
            [
              "Full Dependency",
              "The complete graph of every node, fact, and condition, and how they all connect.",
            ],
            [
              "Attack Flow",
              "The same elements arranged as the ordered flow of the attack, with the option to hide external input facts.",
            ],
            ["Colors", "Nodes, facts, and combines are color-coded; the legend explains each. Selecting an element shows its full data in the side panel."],
          ]}
        />
        <h4 className="help-subhead">Flow</h4>
        <HelpList
          items={[
            ["Flow diagram", "A top-down data-flow diagram of the attack, color-coded by fact, combine, and technique."],
            ["Export", "The Graph saves as PNG; the Flow saves as SVG or Mermaid source."],
          ]}
        />
      </>
    ),
  },
];

export function HelpPage() {
  const [activeId, setActiveId] = useState(SECTIONS[0].id);
  const active = SECTIONS.find((s) => s.id === activeId) ?? SECTIONS[0];

  return (
    <main className="help-page">
      <aside className="help-sidebar" aria-label="Help sections">
        <p className="help-sidebar-title">Guide</p>
        <nav className="help-nav">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`help-nav-item${s.id === active.id ? " active" : ""}`}
              onClick={() => setActiveId(s.id)}
            >
              {s.label}
            </button>
          ))}
        </nav>
      </aside>

      <div className="help-content">
        <section className="help-section">
          <div className="help-section-head">
            <h3>{active.title}</h3>
            {active.note ? <p className="help-section-note">{active.note}</p> : null}
          </div>
          {active.content}
        </section>
      </div>
    </main>
  );
}

function HelpList({ items }: { items: Array<[string, string]> }) {
  return (
    <dl className="help-list">
      {items.map(([label, description]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{description}</dd>
        </div>
      ))}
    </dl>
  );
}
