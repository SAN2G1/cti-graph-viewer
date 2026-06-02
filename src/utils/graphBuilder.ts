import type cytoscape from "cytoscape";
import type { Combine, Fact, GraphEdgeData, GraphViewOptions, ParsedWorkbook } from "../types/graph";
import { getTwoHopIds, truncateLabel } from "./graphAlgorithms";

type EdgeMap = Map<string, GraphEdgeData>;

export function buildCytoscapeElements(
  input: ParsedWorkbook,
  options: GraphViewOptions,
): cytoscape.ElementDefinition[] {
  const full = options.viewMode === "attack" ? buildAttackFlowElements(input, options) : buildFullElements(input, options);
  const searched = applySearchAndFilters(full, input, options);

  if (options.viewMode === "focus" && options.selectedIds?.length) {
    const visibleIds = getTwoHopIds(searched, options.selectedIds);
    return searched.filter((element) => {
      const data = element.data as Record<string, unknown>;
      if (data.source && data.target) return visibleIds.has(String(data.source)) && visibleIds.has(String(data.target));
      return visibleIds.has(String(data.id));
    });
  }

  return searched;
}

function buildFullElements(input: ParsedWorkbook, options: GraphViewOptions): cytoscape.ElementDefinition[] {
  const diagnosticIds = new Set(input.diagnostics.flatMap((diagnostic) => diagnostic.relatedIds));
  const elements: cytoscape.ElementDefinition[] = [];

  for (const node of input.nodes) {
    elements.push({
      data: {
        id: node.id,
        entityType: "node",
        label: `${node.id}\n${node.techniqueId}\n${truncateLabel(node.techniqueName)}`,
        searchText: `${node.id} ${node.techniqueId} ${node.techniqueName} ${node.behaviorSummary}`.toLowerCase(),
        tactic: node.tactic,
        hasDiagnostic: diagnosticIds.has(node.id),
      },
      classes: classNames(["attack-node", diagnosticIds.has(node.id) && "has-diagnostic"]),
    });
  }

  for (const fact of input.facts) {
    if (fact.isExternal && options.showExternalFacts === false) continue;
    if (fact.level === "execution_required" && options.showExecutionRequiredFacts === false) continue;
    elements.push({
      data: {
        id: fact.id,
        entityType: "fact",
        label: `${fact.id}\n${truncateLabel(fact.name)}`,
        searchText: `${fact.id} ${fact.name} ${fact.description}`.toLowerCase(),
        isExternal: fact.isExternal,
        level: fact.level,
        hasDiagnostic: diagnosticIds.has(fact.id),
      },
      classes: classNames(["fact-node", fact.isExternal && "external-fact", fact.level === "execution_required" && "execution-required", diagnosticIds.has(fact.id) && "has-diagnostic"]),
    });
  }

  const nestedCombines = new Set(input.combines.flatMap((combine) => combine.members.filter((member) => member.startsWith("C"))));
  for (const combine of input.combines) {
    elements.push({
      data: {
        id: combine.id,
        entityType: "combine",
        label: `${combine.id}\n${combine.operator}\n${truncateLabel(combine.label)}`,
        searchText: `${combine.id} ${combine.operator} ${combine.label}`.toLowerCase(),
        operator: combine.operator,
        nested: nestedCombines.has(combine.id),
        hasDiagnostic: diagnosticIds.has(combine.id),
      },
      classes: classNames(["combine-node", combine.operator === "AND" ? "and-combine" : "or-combine", nestedCombines.has(combine.id) && "nested-combine", diagnosticIds.has(combine.id) && "has-diagnostic"]),
    });
  }

  const edges = new Map<string, GraphEdgeData>();
  for (const node of input.nodes) {
    node.parsers.forEach((factId) => addEdge(edges, node.id, factId, "parses"));
    node.requirements.forEach((requirementId) => addEdge(edges, requirementId, node.id, "requires"));
  }
  for (const fact of input.facts) {
    fact.producers.forEach((nodeId) => addEdge(edges, nodeId, fact.id, "produces"));
    fact.consumers.forEach((nodeId) => addEdge(edges, fact.id, nodeId, "consumes"));
  }
  for (const combine of input.combines) {
    combine.members.forEach((memberId) => addEdge(edges, memberId, combine.id, "combine_member"));
    combine.consumer.forEach((consumerId) => addEdge(edges, combine.id, consumerId, "combine_output"));
  }

  elements.push(...edgeElements(edges, diagnosticIds, factNameMap(input)));
  return removeDanglingEdges(elements);
}

function buildAttackFlowElements(input: ParsedWorkbook, options: GraphViewOptions): cytoscape.ElementDefinition[] {
  const elements: cytoscape.ElementDefinition[] = input.nodes.map((node) => ({
    data: {
      id: node.id,
      entityType: "node",
      label: `${node.id}\n${node.techniqueId}\n${truncateLabel(node.techniqueName)}`,
      searchText: `${node.id} ${node.techniqueId} ${node.techniqueName} ${node.behaviorSummary}`.toLowerCase(),
      tactic: node.tactic,
    },
    classes: "attack-node",
  }));

  const factMap = new Map(input.facts.map((fact) => [fact.id, fact]));
  const combineMap = new Map(input.combines.map((combine) => [combine.id, combine]));
  const producerByFact = new Map<string, string[]>();

  for (const fact of input.facts) producerByFact.set(fact.id, [...fact.producers]);
  for (const node of input.nodes) {
    for (const factId of node.parsers) {
      producerByFact.set(factId, [...new Set([...(producerByFact.get(factId) ?? []), node.id])]);
    }
  }

  const usedCombines = new Set<string>();
  const usedExternalFacts = new Set<string>();
  const edges = new Map<string, GraphEdgeData>();

  const ensureExternalFactNode = (factId: string): string | null => {
    const fact = factMap.get(factId);
    if (!fact || !shouldIncludeAttackFact(fact, options) || !fact.isExternal) return null;
    const externalId = `${factId}_external`;
    if (!usedExternalFacts.has(externalId)) {
      usedExternalFacts.add(externalId);
      elements.push({
        data: {
          id: externalId,
          entityType: "fact",
          label: `${fact.id}\nexternal`,
          searchText: `${fact.id} ${fact.name} external ${fact.description}`.toLowerCase(),
          isExternal: true,
          level: fact.level,
        },
        classes: "fact-node external-fact attack-flow-external-fact",
      });
    }
    return externalId;
  };

  const ensureCombineNode = (combineId: string): Combine | null => {
    const combine = combineMap.get(combineId);
    if (!combine) return null;
    if (!usedCombines.has(combineId)) {
      usedCombines.add(combineId);
      elements.push({
        data: {
          id: combine.id,
          entityType: "combine",
          label: combine.operator,
          searchText: `${combine.id} ${combine.operator} ${combine.label}`.toLowerCase(),
          operator: combine.operator,
          detailLabel: combine.label,
        },
        classes: classNames(["combine-node", "attack-flow-gate", combine.operator === "AND" ? "and-combine" : "or-combine"]),
      });
    }
    return combine;
  };

  const connectRequirement = (requirementId: string, targetId: string): void => {
    if (requirementId.startsWith("F")) {
      const fact = factMap.get(requirementId);
      if (!fact || !shouldIncludeAttackFact(fact, options)) return;

      const producers = producerByFact.get(requirementId) ?? [];
      if (producers.length > 0) {
        producers.forEach((producerId) => addEdge(edges, producerId, targetId, requirementId));
        return;
      }

      const sourceId = ensureExternalFactNode(requirementId);
      if (sourceId) addEdge(edges, sourceId, targetId, requirementId);
      return;
    }

    if (!requirementId.startsWith("C")) return;
    const combine = ensureCombineNode(requirementId);
    if (!combine) return;
    addEdge(edges, requirementId, targetId, "combine_output");
    combine.members.forEach((memberId) => connectRequirement(memberId, requirementId));
  };

  input.nodes.forEach((node) => {
    node.requirements.forEach((requirementId) => connectRequirement(requirementId, node.id));
  });

  elements.push(...edgeElements(edges, new Set(), factNameMap(input)));
  return removeDanglingEdges(elements);
}

function shouldIncludeAttackFact(fact: Fact, options: GraphViewOptions): boolean {
  if (fact.isExternal && options.showExternalFacts === false) return false;
  if (fact.level === "execution_required" && options.showExecutionRequiredFacts === false) return false;
  return true;
}

function applySearchAndFilters(
  elements: cytoscape.ElementDefinition[],
  input: ParsedWorkbook,
  options: GraphViewOptions,
): cytoscape.ElementDefinition[] {
  const severityIds =
    options.severityFilter && options.severityFilter !== "all"
      ? new Set(input.diagnostics.filter((diagnostic) => diagnostic.severity === options.severityFilter).flatMap((diagnostic) => diagnostic.relatedIds))
      : undefined;
  const search = options.searchTerm?.trim().toLowerCase();
  const matchingIds = new Set<string>();

  for (const element of elements) {
    const data = element.data as Record<string, unknown>;
    if (data.source || !data.id) continue;
    const id = String(data.id);
    if (options.tacticFilter && data.entityType === "node" && data.tactic !== options.tacticFilter) continue;
    if (severityIds && !severityIds.has(id)) continue;
    if (search && !String(data.searchText ?? "").includes(search)) continue;
    matchingIds.add(id);
  }

  if (!search && !severityIds && !options.tacticFilter) return elements;
  if (matchingIds.size === 0) return [];

  const visibleIds = expandVisibleContext(elements, matchingIds, options.viewMode === "attack" ? 2 : 1);
  return elements.filter((element) => {
    const data = element.data as Record<string, unknown>;
    if (data.source && data.target) return visibleIds.has(String(data.source)) && visibleIds.has(String(data.target));
    return visibleIds.has(String(data.id));
  });
}

function expandVisibleContext(
  elements: cytoscape.ElementDefinition[],
  seedIds: Set<string>,
  depth: number,
): Set<string> {
  const adjacency = new Map<string, Set<string>>();

  for (const element of elements) {
    const data = element.data as Record<string, unknown>;
    if (data.source && data.target) {
      const source = String(data.source);
      const target = String(data.target);
      addNeighbor(adjacency, source, target);
      addNeighbor(adjacency, target, source);
    } else if (data.id) {
      adjacency.set(String(data.id), adjacency.get(String(data.id)) ?? new Set());
    }
  }

  const visible = new Set(seedIds);
  let frontier = new Set(seedIds);
  for (let step = 0; step < depth; step += 1) {
    const next = new Set<string>();
    for (const id of frontier) {
      for (const neighbor of adjacency.get(id) ?? []) {
        if (!visible.has(neighbor)) next.add(neighbor);
        visible.add(neighbor);
      }
    }
    frontier = next;
    if (frontier.size === 0) break;
  }

  return visible;
}

function addNeighbor(adjacency: Map<string, Set<string>>, source: string, target: string): void {
  const neighbors = adjacency.get(source) ?? new Set<string>();
  neighbors.add(target);
  adjacency.set(source, neighbors);
}

function addEdge(edges: EdgeMap, source: string, target: string, edgeType: string): void {
  if (!source || !target) return;
  const key = `${source}->${target}`;
  const existing = edges.get(key);
  if (existing) {
    if (!existing.edgeTypes.includes(edgeType)) existing.edgeTypes.push(edgeType);
    existing.label = existing.edgeTypes.join(", ");
    return;
  }
  edges.set(key, {
    id: key,
    source,
    target,
    edgeTypes: [edgeType],
    label: edgeType,
    displayLabel: edgeType,
  });
}

function edgeElements(
  edges: EdgeMap,
  diagnosticIds: Set<string>,
  factNames: Map<string, string>,
): cytoscape.ElementDefinition[] {
  return [...edges.values()].map((edge) => ({
    data: {
      ...edge,
      displayLabel: edgeDisplayLabel(edge),
      hoverLabel: edgeHoverLabel(edge, factNames),
    },
    classes: classNames([
      "dependency-edge",
      edge.edgeTypes.some((edgeType) => edgeType.startsWith("F")) && "fact-condition-edge",
      edge.edgeTypes.includes("combine_member") && "combine-member-edge",
      edge.edgeTypes.includes("combine_output") && "combine-output-edge",
      (diagnosticIds.has(edge.source) || diagnosticIds.has(edge.target)) && "diagnostic-edge",
    ]),
  }));
}

function removeDanglingEdges(elements: cytoscape.ElementDefinition[]): cytoscape.ElementDefinition[] {
  const nodeIds = new Set(elements.filter((element) => !(element.data as Record<string, unknown>).source).map((element) => String((element.data as Record<string, unknown>).id)));
  return elements.filter((element) => {
    const data = element.data as Record<string, unknown>;
    if (!data.source || !data.target) return true;
    return nodeIds.has(String(data.source)) && nodeIds.has(String(data.target));
  });
}

function classNames(values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

function factNameMap(input: ParsedWorkbook): Map<string, string> {
  return new Map(input.facts.map((fact) => [fact.id, fact.name]));
}

function edgeDisplayLabel(edge: GraphEdgeData): string {
  const factIds = edge.edgeTypes.filter((edgeType) => edgeType.startsWith("F"));
  return factIds.join("\n");
}

function edgeHoverLabel(edge: GraphEdgeData, factNames: Map<string, string>): string | undefined {
  const factIds = edge.edgeTypes.filter((edgeType) => edgeType.startsWith("F"));
  if (factIds.length > 0) {
    return factIds
      .map((factId) => {
        const name = factNames.get(factId);
        return name ? `${factId} ${name}` : factId;
      })
      .join(", ");
  }
  if (edge.edgeTypes.includes("combine_output")) return "Condition satisfied";
  return undefined;
}
