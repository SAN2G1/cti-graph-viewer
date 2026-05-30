import type cytoscape from "cytoscape";
import { ALLOWED_TACTICS } from "../constants/allowedValues";

type FlowLayoutOptions = {
  rankMode?: "directed-flow" | "mitre-tactic";
};

export function getTwoHopIds(elements: cytoscape.ElementDefinition[], selectedIds: string[]): Set<string> {
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

  const visited = new Set<string>(selectedIds);
  let frontier = new Set<string>(selectedIds);
  for (let depth = 0; depth < 2; depth += 1) {
    const next = new Set<string>();
    for (const id of frontier) {
      for (const neighbor of adjacency.get(id) ?? []) {
        if (!visited.has(neighbor)) next.add(neighbor);
        visited.add(neighbor);
      }
    }
    frontier = next;
  }
  return visited;
}

export function truncateLabel(text: string, max = 28): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1))}…`;
}

export function buildDirectedFlowLayout(
  cy: cytoscape.Core,
  orientation: "horizontal" | "vertical",
  options: FlowLayoutOptions = {},
): Map<string, cytoscape.Position> {
  const nodes = cy.nodes().toArray();
  const nodeIds = nodes.map((node) => node.id());
  const outgoing = new Map<string, Set<string>>();
  const incoming = new Map<string, Set<string>>();

  for (const nodeId of nodeIds) {
    outgoing.set(nodeId, new Set());
    incoming.set(nodeId, new Set());
  }

  cy.edges().forEach((edge) => {
    const sourceId = edge.source().id();
    const targetId = edge.target().id();
    if (!outgoing.has(sourceId) || !incoming.has(targetId)) return;
    outgoing.get(sourceId)?.add(targetId);
    incoming.get(targetId)?.add(sourceId);
  });

  const { componentByNodeId, components } = buildStronglyConnectedComponents(nodeIds, outgoing);
  const dagOutgoing = new Map<number, Set<number>>();
  const dagIncoming = new Map<number, Set<number>>();
  components.forEach((_, index) => {
    dagOutgoing.set(index, new Set());
    dagIncoming.set(index, new Set());
  });

  for (const [sourceId, targets] of outgoing) {
    const sourceComponent = componentByNodeId.get(sourceId);
    if (sourceComponent === undefined) continue;
    for (const targetId of targets) {
      const targetComponent = componentByNodeId.get(targetId);
      if (targetComponent === undefined || targetComponent === sourceComponent) continue;
      dagOutgoing.get(sourceComponent)?.add(targetComponent);
      dagIncoming.get(targetComponent)?.add(sourceComponent);
    }
  }

  const directedComponentRank = computeComponentRanks(components.length, dagIncoming, dagOutgoing);
  const componentRank =
    options.rankMode === "mitre-tactic"
      ? computeMitreComponentRanks(nodes, componentByNodeId, incoming, outgoing, directedComponentRank)
      : directedComponentRank;
  const nodeEntries = nodes.map((node) => {
    const componentIndex = componentByNodeId.get(node.id()) ?? 0;
    return {
      id: node.id(),
      componentIndex,
      rank: componentRank.get(componentIndex) ?? 0,
      tacticIndex: getNodeTacticIndex(node),
      degreeScore: (outgoing.get(node.id())?.size ?? 0) - (incoming.get(node.id())?.size ?? 0),
    };
  });

  const groups = new Map<number, typeof nodeEntries>();
  for (const entry of nodeEntries) {
    const list = groups.get(entry.rank) ?? [];
    list.push(entry);
    groups.set(entry.rank, list);
  }

  const positions = new Map<string, cytoscape.Position>();
  const rankEntries = [...groups.entries()].sort((left, right) => left[0] - right[0]);
  const isMitreLayout = options.rankMode === "mitre-tactic";
  const columnGap = orientation === "horizontal" ? (isMitreLayout ? 300 : 220) : (isMitreLayout ? 190 : 140);
  const rowGap = orientation === "horizontal" ? 120 : 200;
  const primaryKey: "x" | "y" = orientation === "horizontal" ? "x" : "y";
  const secondaryKey: "x" | "y" = orientation === "horizontal" ? "y" : "x";

  rankEntries.forEach(([rank, entries], rankIndex) => {
    entries.sort((left, right) => {
      if (options.rankMode === "mitre-tactic" && left.tacticIndex !== right.tacticIndex) {
        return left.tacticIndex - right.tacticIndex;
      }
      if (left.degreeScore !== right.degreeScore) return right.degreeScore - left.degreeScore;
      return left.id.localeCompare(right.id);
    });

    const offset = ((entries.length - 1) * rowGap) / 2;
    entries.forEach((entry, index) => {
      const position: cytoscape.Position = {
        x: 0,
        y: 0,
      };
      position[primaryKey] = rank * columnGap;
      position[secondaryKey] = index * rowGap - offset;
      positions.set(entry.id, position);
    });
  });

  centerPositions(positions, orientation);
  return positions;
}

function computeMitreComponentRanks(
  nodes: cytoscape.NodeSingular[],
  componentByNodeId: Map<string, number>,
  incoming: Map<string, Set<string>>,
  outgoing: Map<string, Set<string>>,
  fallbackRank: Map<number, number>,
): Map<number, number> {
  const rankSamples = new Map<number, number[]>();

  for (const node of nodes) {
    const componentIndex = componentByNodeId.get(node.id());
    if (componentIndex === undefined) continue;

    const ownTacticIndex = getNodeTacticIndex(node);
    if (ownTacticIndex < ALLOWED_TACTICS.length) {
      const samples = rankSamples.get(componentIndex) ?? [];
      samples.push(ownTacticIndex);
      rankSamples.set(componentIndex, samples);
      continue;
    }

    const neighborTacticIndexes = [...(incoming.get(node.id()) ?? []), ...(outgoing.get(node.id()) ?? [])]
      .map((neighborId) => nodes.find((candidate) => candidate.id() === neighborId))
      .filter((candidate): candidate is cytoscape.NodeSingular => Boolean(candidate))
      .map((candidate) => getNodeTacticIndex(candidate))
      .filter((index) => index < ALLOWED_TACTICS.length);

    if (neighborTacticIndexes.length > 0) {
      const samples = rankSamples.get(componentIndex) ?? [];
      samples.push(average(neighborTacticIndexes));
      rankSamples.set(componentIndex, samples);
    }
  }

  const ranks = new Map<number, number>();
  for (const componentIndex of new Set([...componentByNodeId.values()])) {
    const samples = rankSamples.get(componentIndex);
    if (samples && samples.length > 0) {
      ranks.set(componentIndex, Math.round(average(samples)));
    } else {
      ranks.set(componentIndex, ALLOWED_TACTICS.length + (fallbackRank.get(componentIndex) ?? 0));
    }
  }

  return ranks;
}

function getNodeTacticIndex(node: cytoscape.NodeSingular): number {
  const tactic = node.data("tactic") as string | undefined;
  const index = tactic ? ALLOWED_TACTICS.indexOf(tactic as never) : -1;
  return index >= 0 ? index : ALLOWED_TACTICS.length;
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function addNeighbor(adjacency: Map<string, Set<string>>, source: string, target: string): void {
  const neighbors = adjacency.get(source) ?? new Set<string>();
  neighbors.add(target);
  adjacency.set(source, neighbors);
}

function buildStronglyConnectedComponents(
  nodeIds: string[],
  outgoing: Map<string, Set<string>>,
): {
  componentByNodeId: Map<string, number>;
  components: string[][];
} {
  const indexByNode = new Map<string, number>();
  const lowLinkByNode = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const components: string[][] = [];
  let index = 0;

  const visit = (nodeId: string): void => {
    indexByNode.set(nodeId, index);
    lowLinkByNode.set(nodeId, index);
    index += 1;
    stack.push(nodeId);
    onStack.add(nodeId);

    for (const targetId of outgoing.get(nodeId) ?? []) {
      if (!indexByNode.has(targetId)) {
        visit(targetId);
        lowLinkByNode.set(nodeId, Math.min(lowLinkByNode.get(nodeId) ?? 0, lowLinkByNode.get(targetId) ?? 0));
      } else if (onStack.has(targetId)) {
        lowLinkByNode.set(nodeId, Math.min(lowLinkByNode.get(nodeId) ?? 0, indexByNode.get(targetId) ?? 0));
      }
    }

    if ((lowLinkByNode.get(nodeId) ?? 0) === (indexByNode.get(nodeId) ?? 0)) {
      const component: string[] = [];
      let current: string | undefined;
      do {
        current = stack.pop();
        if (!current) break;
        onStack.delete(current);
        component.push(current);
      } while (current !== nodeId);
      components.push(component);
    }
  };

  for (const nodeId of nodeIds) {
    if (!indexByNode.has(nodeId)) visit(nodeId);
  }

  const componentByNodeId = new Map<string, number>();
  components.forEach((component, componentIndex) => {
    component.forEach((nodeId) => componentByNodeId.set(nodeId, componentIndex));
  });

  return { componentByNodeId, components };
}

function computeComponentRanks(
  componentCount: number,
  dagIncoming: Map<number, Set<number>>,
  dagOutgoing: Map<number, Set<number>>,
): Map<number, number> {
  const inDegree = new Map<number, number>();
  const rank = new Map<number, number>();
  const queue: number[] = [];

  for (let index = 0; index < componentCount; index += 1) {
    const degree = dagIncoming.get(index)?.size ?? 0;
    inDegree.set(index, degree);
    rank.set(index, 0);
    if (degree === 0) queue.push(index);
  }

  if (queue.length === 0) {
    for (let index = 0; index < componentCount; index += 1) queue.push(index);
  }

  while (queue.length > 0) {
    const component = queue.shift()!;
    for (const next of dagOutgoing.get(component) ?? []) {
      const nextRank = Math.max(rank.get(next) ?? 0, (rank.get(component) ?? 0) + 1);
      rank.set(next, nextRank);
      const degree = (inDegree.get(next) ?? 0) - 1;
      inDegree.set(next, degree);
      if (degree <= 0) queue.push(next);
    }
  }

  return rank;
}

function centerPositions(
  positions: Map<string, cytoscape.Position>,
  orientation: "horizontal" | "vertical",
): void {
  if (positions.size === 0) return;

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const position of positions.values()) {
    minX = Math.min(minX, position.x);
    maxX = Math.max(maxX, position.x);
    minY = Math.min(minY, position.y);
    maxY = Math.max(maxY, position.y);
  }

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const swap = orientation === "vertical";

  for (const position of positions.values()) {
    position.x -= centerX;
    position.y -= centerY;
    if (swap) {
      const currentX = position.x;
      position.x = position.y;
      position.y = currentX;
    }
  }
}
