import type { ReactNode } from "react";

export function HelpPage() {
  return (
    <main className="help-page">
      <section className="help-hero">
        <div>
          <p className="help-eyebrow">Guide</p>
          <h2>CTI Graph Viewer — Guide</h2>
          <p className="help-intro">
            Load one data file to review the nodes, facts, and dependency graph in a single
            place. Below is a glossary and a summary of what each tab does.
          </p>
        </div>
        <nav className="help-nav" aria-label="Help sections">
          <a href="#help-glossary">Glossary</a>
          <a href="#help-topbar">Top bar</a>
          <a href="#help-nodes">Nodes</a>
          <a href="#help-facts">Facts</a>
          <a href="#help-diagram">Diagram</a>
          <a href="#help-shortcuts">Shortcuts</a>
        </nav>
      </section>

      <div className="help-sections">
        <Section id="help-glossary" title="Glossary">
          <HelpList
            items={[
              ["Node", "A single technique used in the attack"],
              ["Fact", "A premise or piece of information the attack relies on"],
              ["Combine", "Several facts grouped with an AND / OR condition"],
              ["Tactic", "An attack-objective stage that groups nodes"],
            ]}
          />
        </Section>

        <Section id="help-topbar" title="Top bar" note="Load data and export notes">
          <HelpList
            items={[
              ["Load", "Loads viewer_data.json into every tab"],
              ["Images", "Picks the report-page image folder"],
              ["Import", "Loads and restores a saved notes file"],
              ["JSON, CSV", "Saves node and fact notes to a file"],
            ]}
          />
        </Section>

        <Section id="help-nodes" title="Nodes tab" note="Browse node data and take notes">
          <HelpList
            items={[
              ["Prev, Next, Node List", "Move between nodes with buttons, arrow keys, or search"],
              ["Requirements", "Tree of required facts and AND / OR conditions"],
              ["Parsers, Relationships", "Parser facts and relationship statements"],
              ["Dependency", "Mini graph of the node and its directly connected facts, gates, and nodes"],
              ["Report Pages", "View the source report pages as text or image"],
              ["Note", "Free-form note per node"],
            ]}
          />
        </Section>

        <Section id="help-facts" title="Facts tab" note="Browse fact data and take notes">
          <HelpList
            items={[
              ["Search", "Find facts by name or description"],
              ["is_external", "Read-only external flag"],
              ["Note", "Free-form note per fact"],
              ["Report Pages", "View the related report pages"],
            ]}
          />
        </Section>

        <Section id="help-diagram" title="Diagram tab" note="Switch with the Graph / Flow toggle">
          <h4 className="help-subhead">Graph</h4>
          <HelpList
            items={[
              ["Full Dependency, Attack Flow", "Switch between the full structure and the attack flow"],
              ["Search", "Find elements by id or name"],
              ["External facts", "Attack Flow only — show or hide external input nodes"],
              ["Auto Layout, Fit", "Re-arrange the graph and fit it to the screen"],
              ["Select", "Click a node to highlight neighbors and show its details"],
              ["PNG", "Save the graph as a PNG image"],
            ]}
          />
          <h4 className="help-subhead">Flow</h4>
          <HelpList
            items={[
              ["Mermaid", "Data-flow diagram, color-coded by fact / condition / technique"],
              ["Zoom, Fit", "Zoom in or out and fit to the width"],
              ["SVG, Copy", "Save as SVG or copy the source code"],
            ]}
          />
        </Section>

        <Section id="help-shortcuts" title="Shortcuts">
          <HelpList items={[["Arrow keys", "Move to the previous / next node"]]} />
        </Section>
      </div>
    </main>
  );
}

function Section({
  id,
  title,
  note,
  children,
}: {
  id: string;
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="help-section">
      <div className="help-section-head">
        <h3>{title}</h3>
        {note ? <p className="help-section-note">{note}</p> : null}
      </div>
      {children}
    </section>
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
