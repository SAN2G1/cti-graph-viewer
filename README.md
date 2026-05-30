# Interactive CTI Dependency Hypergraph Viewer

Browser-based React + TypeScript tool for loading CTI answer sheets from `node.xlsx`, `fact.xlsx`, and `combine.xlsx`, rendering the dependency hypergraph, and running mechanical validation over Node/Fact/Combine tables.

## Install

```bash
npm install
```

## Run

```bash
npm run dev
```

Open the Vite URL shown in the terminal, then upload either:

- Separate `node.xlsx`, `fact.xlsx`, `combine.xlsx` files
- One combined workbook containing `Node Table`, `Fact Table`, and `Combine Table` sheets
- Optional GT workbook for technique comparison

## Test

```bash
npm test
```

## Input Schemas

Node Table header order must be:

```text
node_id, tactic, technique_id, technique_name, behavior_summary, requirements, relationships, parsers, ref
```

Fact Table header order must be:

```text
fact_id, name, producers, consumers, is_external, level, description, ref
```

Combine Table header order must be:

```text
combine_id, operator, members, consumer, label
```

The parser tolerates whitespace, bracketed lists, comma/semicolon/slash-separated IDs, and lower-case IDs. Strict validation still checks the original header order and allowed values.

## Validation

The diagnostics engine implements checks `[0]` through `[7]`:

- `[0]` Exact table headers
- `[1]` ID formats, allowed tactic/operator/is_external/level values, duplicate IDs
- `[1b]` Relationship format and allowed verbs
- `[2]` Missing references and wrong reference types
- `[3]` Fact producers and Node parsers bidirectional consistency
- `[3b]` Node leaf requirements and Fact consumers bidirectional consistency
- `[4]` Combine member count, consumer count, cycles, and multi-requirement nodes
- `[5]` External fact producer consistency
- `[6]` Reachability simulation from external facts
- `[7]` Optional GT technique ID/name comparison

## View Modes

- Full Dependency View: all Node, Fact, Combine entities and dependency edges
- Attack Flow View: node-centric flow with indirect fact dependencies collapsed
- Focus View: selected entity plus undirected 2-hop neighborhood
- Diagnostics View: entities related to diagnostics highlighted, unrelated entities dimmed

## Workflow

1. Upload the three workbooks or a combined workbook.
2. Inspect the Summary Bar for counts and failure totals.
3. Use Full Dependency View to inspect producer, consumer, parser, and combine structure.
4. Click a node, fact, combine, or diagnostic to focus related graph objects.
5. Switch to Attack Flow View for node-to-node dependency flow.
6. Export JSON or PNG from the toolbar.
