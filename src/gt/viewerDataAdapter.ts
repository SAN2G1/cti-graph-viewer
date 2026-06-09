// Convert the unified data source (viewer_data.json) into the ParsedWorkbook
// shape consumed by the existing cytoscape graph viewer.
//
// viewer_data.json is the richer format (report pages, nested requirement trees,
// inferred flags). The graph viewer only needs the flat dependency
// structure, which we reconstruct here:
//   - facts.producers / facts.consumers  -> producer/consumer node links
//   - combines.members / combines.consumer -> AND/OR gates
//   - node.requirements (reconstructed)   -> direct F/C inputs of a node
import type { AttackNode, Combine, Fact, ParsedWorkbook } from "../types/graph";
import { parseRelationshipCell } from "../utils/relationshipParser";
import type { ViewerCombine, ViewerData } from "./types";

const isFactId = (id: string) => /^F/i.test(id);
const isCombineId = (id: string) => /^C/i.test(id);
const isNodeId = (id: string) => /^N/i.test(id);

function splitMembers(members: string[] | string | undefined): string[] {
  if (Array.isArray(members)) return members.filter(Boolean);
  return String(members || "")
    .split(/[,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function viewerDataToParsedWorkbook(data: ViewerData): ParsedWorkbook {
  const combines: ViewerCombine[] = Array.isArray(data.combines) ? data.combines : [];
  const combineById = new Map(combines.map((c) => [c.combine_id, c]));

  // Follow a combine's consumer chain through nested combines to its terminal node.
  const terminalNode = (cid: string): string | undefined => {
    let cur = combineById.get(cid)?.consumer;
    const seen = new Set<string>();
    while (cur && isCombineId(cur) && combineById.has(cur) && !seen.has(cur)) {
      seen.add(cur);
      cur = combineById.get(cur)?.consumer;
    }
    return cur;
  };

  // suppressed[factId] = nodes that the fact already reaches *through* a combine,
  // so we don't also list it as a direct requirement of that node.
  const suppressed = new Map<string, Set<string>>();
  combines.forEach((c) => {
    const term = terminalNode(c.combine_id);
    if (!term) return;
    splitMembers(c.members).forEach((m) => {
      if (!isFactId(m)) return;
      if (!suppressed.has(m)) suppressed.set(m, new Set());
      suppressed.get(m)?.add(term);
    });
  });

  const facts: Fact[] = Object.values(data.facts || {}).map((f, index) => {
    const isExternal = f.is_external === true ? true : f.is_external === false ? false : null;
    return {
      id: f.fact_id,
      type: "fact",
      name: f.name || "",
      producers: (f.producers || []).filter(isNodeId),
      consumers: (f.consumers || []).filter(isNodeId),
      isExternalRaw: isExternal === true ? "TRUE" : isExternal === false ? "FALSE" : "",
      isExternal,
      level: f.level || "",
      description: f.description || "",
      raw: f as unknown as Record<string, unknown>,
      rowIndex: index + 2,
    };
  });

  const combineList: Combine[] = combines.map((c, index) => ({
    id: c.combine_id,
    type: "combine",
    operator: String(c.operator || "AND").toUpperCase(),
    members: splitMembers(c.members).filter((m) => isFactId(m) || isCombineId(m)),
    consumer: c.consumer ? [c.consumer].filter((x) => isNodeId(x) || isCombineId(x)) : [],
    label: c.label || "",
    raw: c as unknown as Record<string, unknown>,
    rowIndex: index + 2,
  }));

  // Reconstruct each node's direct requirements: top-level combines feeding the
  // node + facts consumed by the node that aren't already routed via a combine.
  const combinesByConsumerNode = new Map<string, string[]>();
  combines.forEach((c) => {
    if (c.consumer && isNodeId(c.consumer)) {
      const arr = combinesByConsumerNode.get(c.consumer) || [];
      arr.push(c.combine_id);
      combinesByConsumerNode.set(c.consumer, arr);
    }
  });

  const nodes: AttackNode[] = (data.nodes || []).map((n, index) => {
    const reqCombines = combinesByConsumerNode.get(n.node_id) || [];
    const reqFacts = facts
      .filter((f) => f.consumers.includes(n.node_id) && !suppressed.get(f.id)?.has(n.node_id))
      .map((f) => f.id);
    const parsers = (n.parsers || []).map((p) => p.fact_id || "").filter((id) => isFactId(id));
    return {
      id: n.node_id,
      type: "node",
      tactic: n.tactic || "",
      techniqueId: n.technique_id || "",
      techniqueName: n.technique_name || "",
      behaviorSummary: n.behavior_summary || "",
      requirements: [...reqCombines, ...reqFacts],
      relationships: parseRelationshipCell(n.relationships || ""),
      parsers,
      raw: n as unknown as Record<string, unknown>,
      rowIndex: index + 2,
    };
  });

  return { nodes, facts, combines: combineList };
}
