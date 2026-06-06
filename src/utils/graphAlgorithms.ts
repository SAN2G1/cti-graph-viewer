import type cytoscape from "cytoscape";
import { ALLOWED_TACTICS } from "../constants/allowedValues";

type FlowLayoutOptions = {
  rankMode?: "directed-flow" | "mitre-tactic";
};

type LaneEntry = {
  id: string;
  column: number;
  lane: number;
  offset: number;
  rowGap: number;
  degreeScore: number;
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

  rankEntries.forEach(([rank, entries]) => {
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

export function buildAttackConditionLayout(
  cy: cytoscape.Core,
  orientation: "horizontal" | "vertical",
  selectedIds: string[] = [],
): Map<string, cytoscape.Position> {
  const attackNodes = cy.nodes('.attack-node').toArray();
  const gateNodes = cy.nodes('.attack-flow-gate').toArray();
  const externalNodes = cy.nodes('.attack-flow-external-fact').toArray();
  const positions = new Map<string, cytoscape.Position>();
  const attackById = new Map(attackNodes.map((node) => [node.id(), node]));
  const gateById = new Map(gateNodes.map((node) => [node.id(), node]));
  const dependencyOut = new Map<string, Set<string>>();
  const dependencyIn = new Map<string, Set<string>>();

  attackNodes.forEach((node) => {
    dependencyOut.set(node.id(), new Set());
    dependencyIn.set(node.id(), new Set());
  });

  const gateAttackTargets = new Map<string, string[]>();
  const collectAttackTargets = (gateId: string, visiting = new Set<string>()): string[] => {
    if (gateAttackTargets.has(gateId)) return gateAttackTargets.get(gateId)!;
    if (visiting.has(gateId)) return [];
    visiting.add(gateId);
    const gate = gateById.get(gateId);
    if (!gate) return [];
    const targets = new Set<string>();
    gate.outgoers('edge').targets().forEach((target) => {
      if (target.hasClass('attack-node')) targets.add(target.id());
      else if (target.hasClass('attack-flow-gate')) {
        collectAttackTargets(target.id(), new Set(visiting)).forEach((id) => targets.add(id));
      }
    });
    const result = [...targets];
    gateAttackTargets.set(gateId, result);
    return result;
  };

  attackNodes.forEach((node) => {
    node.outgoers('edge').targets().forEach((target) => {
      if (target.hasClass('attack-node')) {
        dependencyOut.get(node.id())?.add(target.id());
        dependencyIn.get(target.id())?.add(node.id());
      } else if (target.hasClass('attack-flow-gate')) {
        collectAttackTargets(target.id()).forEach((attackId) => {
          dependencyOut.get(node.id())?.add(attackId);
          dependencyIn.get(attackId)?.add(node.id());
        });
      }
    });
  });

  const grouped = new Map<number, cytoscape.NodeSingular[]>();
  attackNodes.forEach((node) => {
    const tacticIndex = Math.min(getNodeTacticIndex(node), ALLOWED_TACTICS.length - 1);
    const list = grouped.get(tacticIndex) ?? [];
    list.push(node);
    grouped.set(tacticIndex, list);
  });

  grouped.forEach((nodes) => {
    nodes.sort((left, right) => {
      const leftScore = (dependencyOut.get(left.id())?.size ?? 0) - (dependencyIn.get(left.id())?.size ?? 0);
      const rightScore = (dependencyOut.get(right.id())?.size ?? 0) - (dependencyIn.get(right.id())?.size ?? 0);
      if (leftScore !== rightScore) return rightScore - leftScore;
      return left.id().localeCompare(right.id());
    });
  });

  const columnGap = 320;
  const rowGap = 170;
  const computeAttackPositions = () => {
    grouped.forEach((nodes, column) => {
      const offset = ((nodes.length - 1) * rowGap) / 2;
      nodes.forEach((node, index) => {
        positions.set(node.id(), {
          x: column * columnGap,
          y: index * rowGap - offset,
        });
      });
    });
  };

  computeAttackPositions();
  for (let sweep = 0; sweep < 5; sweep += 1) {
    grouped.forEach((nodes) => {
      nodes.sort((left, right) => {
        const leftNeighbors = [...(dependencyOut.get(left.id()) ?? []), ...(dependencyIn.get(left.id()) ?? [])]
          .map((id) => positions.get(id)?.y)
          .filter((value): value is number => value !== undefined);
        const rightNeighbors = [...(dependencyOut.get(right.id()) ?? []), ...(dependencyIn.get(right.id()) ?? [])]
          .map((id) => positions.get(id)?.y)
          .filter((value): value is number => value !== undefined);
        const leftScore = leftNeighbors.length > 0 ? average(leftNeighbors) : positions.get(left.id())?.y ?? 0;
        const rightScore = rightNeighbors.length > 0 ? average(rightNeighbors) : positions.get(right.id())?.y ?? 0;
        if (Math.abs(leftScore - rightScore) > 1) return leftScore - rightScore;
        return left.id().localeCompare(right.id());
      });
    });
    computeAttackPositions();
  }

  const gateLevelMemo = new Map<string, number>();
  const getGateLevel = (gateId: string, visiting = new Set<string>()): number => {
    if (gateLevelMemo.has(gateId)) return gateLevelMemo.get(gateId)!;
    if (visiting.has(gateId)) return 0;
    visiting.add(gateId);
    const gate = gateById.get(gateId);
    if (!gate) return 0;
    const levels: number[] = [];
    gate.outgoers('edge').targets().forEach((target) => {
      if (target.hasClass('attack-node')) levels.push(0);
      else if (target.hasClass('attack-flow-gate')) levels.push(getGateLevel(target.id(), new Set(visiting)) + 1);
    });
    const level = levels.length > 0 ? Math.min(...levels) : 0;
    gateLevelMemo.set(gateId, level);
    return level;
  };

  const sortedGates = [...gateNodes].sort((left, right) => getGateLevel(left.id()) - getGateLevel(right.id()));
  sortedGates.forEach((gate, index) => {
    const targets = gate.outgoers('edge').targets().toArray();
    const targetPositions = targets
      .map((target) => positions.get(target.id()))
      .filter((value): value is cytoscape.Position => Boolean(value));
    const incomingPositions = gate.incomers('edge').sources().toArray()
      .map((source) => positions.get(source.id()))
      .filter((value): value is cytoscape.Position => Boolean(value));
    const targetAnchor = targetPositions.length > 0
      ? { x: average(targetPositions.map((pos) => pos.x)), y: average(targetPositions.map((pos) => pos.y)) }
      : { x: 0, y: 0 };
    const incomingY = incomingPositions.length > 0 ? average(incomingPositions.map((pos) => pos.y)) : targetAnchor.y;
    const level = getGateLevel(gate.id());
    const x = targetAnchor.x - 140 - level * 110;
    const direction = index % 2 === 0 ? -1 : 1;
    const yBase = (incomingY + targetAnchor.y) / 2;
    const y = Math.abs(incomingY - targetAnchor.y) < 50 ? yBase + direction * (54 + level * 10) : yBase;
    positions.set(gate.id(), { x, y });
  });

  const externalBuckets = new Map<string, cytoscape.NodeSingular[]>();
  externalNodes.forEach((node) => {
    const targets = node.outgoers('edge').targets().toArray();
    const anchorId = targets[0]?.id() ?? '__orphan__';
    const list = externalBuckets.get(anchorId) ?? [];
    list.push(node);
    externalBuckets.set(anchorId, list);
  });
  externalBuckets.forEach((nodes, anchorId) => {
    const anchor = positions.get(anchorId) ?? { x: 0, y: 0 };
    const offset = ((nodes.length - 1) * 74) / 2;
    nodes.forEach((node, index) => {
      positions.set(node.id(), {
        x: anchor.x - 230,
        y: anchor.y + index * 74 - offset,
      });
    });
  });

  adjustAttackFocusLayout(cy, positions, selectedIds);
  centerPositions(positions, orientation);
  return positions;
}

function adjustAttackFocusLayout(
  cy: cytoscape.Core,
  positions: Map<string, cytoscape.Position>,
  selectedIds: string[],
): void {
  const focusId = selectedIds.find((id) => cy.getElementById(id).hasClass("attack-node"));
  if (!focusId) return;
  const focus = positions.get(focusId);
  if (!focus) return;

  const focusNode = cy.getElementById(focusId);
  const inEdges = focusNode.incomers("edge").toArray().filter((ele) => ele.isEdge()) as cytoscape.EdgeSingular[];
  const outEdges = focusNode.outgoers("edge").toArray().filter((ele) => ele.isEdge()) as cytoscape.EdgeSingular[];
  const incomingSources = inEdges.map((edge) => edge.source()).filter((node) => node.isNode());
  const outgoingTargets = outEdges.map((edge) => edge.target()).filter((node) => node.isNode());
  const incomingGates = incomingSources.filter((node) => node.hasClass("attack-flow-gate"));
  const incomingDirect = incomingSources.filter((node) => !node.hasClass("attack-flow-gate"));
  const outgoingGates = outgoingTargets.filter((node) => node.hasClass("attack-flow-gate"));
  const outgoingDirect = outgoingTargets.filter((node) => !node.hasClass("attack-flow-gate"));

  positions.set(focusId, { x: focus.x, y: 0 });

  distributeAroundFocus(incomingDirect, positions, focus.x - 260, -96, 72);
  distributeAroundFocus(outgoingDirect, positions, focus.x + 260, 96, 72);
  distributeAroundFocus(incomingGates, positions, focus.x - 150, -56, 86);
  distributeAroundFocus(outgoingGates, positions, focus.x + 150, 56, 86);

  incomingGates.forEach((gate) => {
    const gatePos = positions.get(gate.id());
    if (!gatePos) return;
    const sources = gate.incomers("edge").sources().toArray();
    const sourcePositions = sources.map((source) => positions.get(source.id())).filter((value): value is cytoscape.Position => Boolean(value));
    if (sourcePositions.length === 0) return;
    positions.set(gate.id(), {
      x: Math.min(focus.x - 120, gatePos.x),
      y: average([0, average(sourcePositions.map((pos) => pos.y))]),
    });
  });

  outgoingGates.forEach((gate) => {
    const gatePos = positions.get(gate.id());
    if (!gatePos) return;
    const targets = gate.outgoers("edge").targets().toArray();
    const targetPositions = targets.map((target) => positions.get(target.id())).filter((value): value is cytoscape.Position => Boolean(value));
    if (targetPositions.length === 0) return;
    positions.set(gate.id(), {
      x: Math.max(focus.x + 120, gatePos.x),
      y: average([0, average(targetPositions.map((pos) => pos.y))]),
    });
  });
}

function distributeAroundFocus(
  nodes: cytoscape.NodeSingular[],
  positions: Map<string, cytoscape.Position>,
  x: number,
  centerY: number,
  rowGap: number,
): void {
  if (nodes.length === 0) return;
  const sorted = [...nodes].sort((left, right) => left.id().localeCompare(right.id()));
  const offset = ((sorted.length - 1) * rowGap) / 2;
  sorted.forEach((node, index) => {
    positions.set(node.id(), {
      x,
      y: centerY + index * rowGap - offset,
    });
  });
}

export function buildDependencyLaneLayout(
  cy: cytoscape.Core,
  orientation: "horizontal" | "vertical",
): Map<string, cytoscape.Position> {
  const nodes = cy.nodes().toArray();
  const nodeById = new Map(nodes.map((node) => [node.id(), node]));
  const adjacency = new Map<string, Set<string>>();
  const incomingAttackCount = new Map<string, number>();
  const outgoingAttackCount = new Map<string, number>();

  nodes.forEach((node) => {
    adjacency.set(node.id(), new Set());
    incomingAttackCount.set(node.id(), 0);
    outgoingAttackCount.set(node.id(), 0);
  });

  cy.edges().forEach((edge) => {
    const sourceId = edge.source().id();
    const targetId = edge.target().id();
    adjacency.get(sourceId)?.add(targetId);
    adjacency.get(targetId)?.add(sourceId);
    if (edge.source().hasClass("attack-node")) {
      incomingAttackCount.set(targetId, (incomingAttackCount.get(targetId) ?? 0) + 1);
    }
    if (edge.target().hasClass("attack-node")) {
      outgoingAttackCount.set(sourceId, (outgoingAttackCount.get(sourceId) ?? 0) + 1);
    }
  });

  const anchorById = new Map<string, number>();
  nodes.forEach((node) => {
    if (node.hasClass("attack-node")) {
      anchorById.set(node.id(), getNodeTacticIndex(node));
    }
  });

  for (let iteration = 0; iteration < 6; iteration += 1) {
    let changed = false;
    for (const node of nodes) {
      if (node.hasClass("attack-node")) continue;
      const samples = [...(adjacency.get(node.id()) ?? [])]
        .map((neighborId) => anchorById.get(neighborId))
        .filter((value): value is number => value !== undefined);
      if (samples.length === 0) continue;
      const nextAnchor = average(samples);
      const current = anchorById.get(node.id());
      if (current === undefined || Math.abs(current - nextAnchor) > 0.01) {
        anchorById.set(node.id(), nextAnchor);
        changed = true;
      }
    }
    if (!changed) break;
  }

  const fallbackColumn = Math.max(0, Math.floor((ALLOWED_TACTICS.length - 1) / 2));
  const entriesByBucket = new Map<string, LaneEntry[]>();

  nodes.forEach((node) => {
    const anchor = anchorById.get(node.id()) ?? fallbackColumn;
    const column = Math.max(0, Math.min(ALLOWED_TACTICS.length - 1, Math.round(anchor)));
    const degree = adjacency.get(node.id())?.size ?? 0;
    const laneMeta = getLaneMeta(node, incomingAttackCount.get(node.id()) ?? 0, outgoingAttackCount.get(node.id()) ?? 0);
    const entry: LaneEntry = {
      id: node.id(),
      column,
      lane: laneMeta.lane,
      offset: laneMeta.offset,
      rowGap: laneMeta.rowGap,
      degreeScore: degree,
    };
    const key = bucketKey(column, laneMeta.lane);
    const list = entriesByBucket.get(key) ?? [];
    list.push(entry);
    entriesByBucket.set(key, list);
  });

  for (const entries of entriesByBucket.values()) {
    entries.sort((left, right) => {
      if (left.degreeScore !== right.degreeScore) return right.degreeScore - left.degreeScore;
      return left.id.localeCompare(right.id);
    });
  }

  for (let sweep = 0; sweep < 4; sweep += 1) {
    const currentPositions = computeLanePositions(entriesByBucket, orientation);
    const bucketEntries = [...entriesByBucket.entries()].sort((left, right) => left[0].localeCompare(right[0]));
    for (const [bucketId, entries] of bucketEntries) {
      entries.sort((left, right) => {
        const leftScore = barycenterScore(left.id, currentPositions, adjacency);
        const rightScore = barycenterScore(right.id, currentPositions, adjacency);
        if (Math.abs(leftScore - rightScore) > 0.5) return leftScore - rightScore;
        if (left.degreeScore !== right.degreeScore) return right.degreeScore - left.degreeScore;
        return left.id.localeCompare(right.id);
      });
      entriesByBucket.set(bucketId, entries);
    }
  }

  const positions = computeLanePositions(entriesByBucket, orientation);

  for (const [id, position] of positions) {
    const node = nodeById.get(id);
    if (!node) continue;
    if (node.hasClass("attack-node")) continue;
    const directAttackNeighbors = [...(adjacency.get(id) ?? [])]
      .map((neighborId) => nodeById.get(neighborId))
      .filter((neighbor): neighbor is cytoscape.NodeSingular => Boolean(neighbor?.hasClass("attack-node")));
    if (directAttackNeighbors.length === 0) continue;
    const averageNeighborPosition = average(directAttackNeighbors.map((neighbor) => positions.get(neighbor.id())?.y ?? 0));
    position.y = (position.y * 0.55) + (averageNeighborPosition * 0.45);
  }

  centerPositions(positions, orientation);
  return positions;
}

function getLaneMeta(node: cytoscape.NodeSingular, incomingFromAttack: number, outgoingToAttack: number): {
  lane: number;
  offset: number;
  rowGap: number;
} {
  if (node.hasClass("attack-node")) {
    return { lane: 0, offset: 0, rowGap: 118 };
  }

  if (node.hasClass("combine-node")) {
    return { lane: 2, offset: 96, rowGap: 94 };
  }

  const isExternal = Boolean(node.data("isExternal"));
  const level = String(node.data("level") ?? "");
  const bias = outgoingToAttack > incomingFromAttack ? -1 : 1;

  if (isExternal) {
    return { lane: -2, offset: -92, rowGap: 82 };
  }

  if (level === "execution_required") {
    return { lane: bias < 0 ? -1 : 1, offset: bias < 0 ? -46 : 46, rowGap: 84 };
  }

  return { lane: bias < 0 ? -1 : 1, offset: bias < 0 ? -42 : 42, rowGap: 78 };
}

function computeLanePositions(
  entriesByBucket: Map<string, LaneEntry[]>,
  orientation: "horizontal" | "vertical",
): Map<string, cytoscape.Position> {
  const positions = new Map<string, cytoscape.Position>();
  const columnGap = 260;
  const laneXOffsetByLane = new Map<number, number>([
    [-2, -74],
    [-1, -34],
    [0, 0],
    [1, 34],
    [2, 74],
  ]);

  for (const entries of entriesByBucket.values()) {
    if (entries.length === 0) continue;
    const sample = entries[0];
    const offset = ((entries.length - 1) * sample.rowGap) / 2;
    entries.forEach((entry, index) => {
      const x = entry.column * columnGap + (laneXOffsetByLane.get(entry.lane) ?? 0);
      const y = entry.offset + index * entry.rowGap - offset;
      positions.set(entry.id, { x, y });
    });
  }

  return positions;
}

function barycenterScore(
  nodeId: string,
  positions: Map<string, cytoscape.Position>,
  adjacency: Map<string, Set<string>>,
): number {
  const neighbors = [...(adjacency.get(nodeId) ?? [])]
    .map((neighborId) => positions.get(neighborId)?.y)
    .filter((value): value is number => value !== undefined);
  if (neighbors.length === 0) return positions.get(nodeId)?.y ?? 0;
  return average(neighbors);
}

function bucketKey(column: number, lane: number): string {
  return `${String(column).padStart(2, "0")}:${String(lane).padStart(2, "0")}`;
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
