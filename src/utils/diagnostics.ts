import {
  ALLOWED_IS_EXTERNAL,
  ALLOWED_LEVELS,
  ALLOWED_OPERATORS,
  ALLOWED_RELATIONSHIP_VERBS,
  ALLOWED_TACTICS,
} from "../constants/allowedValues";
import { COMBINE_HEADERS, FACT_HEADERS, NODE_HEADERS, type TableName } from "../constants/schema";
import type {
  AttackNode,
  Combine,
  Fact,
  GraphDiagnostic,
  GtTable,
  ParsedWorkbook,
} from "../types/graph";
import {
  COMBINE_ID_RE,
  FACT_ID_RE,
  NODE_ID_RE,
  TECHNIQUE_ID_RE,
  classifyId,
  parseIdsFromCell,
} from "./idParser";
import { expandCombineToLeafFacts, expandRequirementToLeafFacts } from "./combineResolver";
import { runReachabilitySimulation } from "./reachability";

let diagnosticCounter = 0;

export function createDiagnostic(
  diagnostic: Omit<GraphDiagnostic, "id">,
): GraphDiagnostic {
  diagnosticCounter += 1;
  return {
    id: `${diagnostic.checkNo}-${diagnostic.type}-${diagnosticCounter}`,
    ...diagnostic,
  };
}

export function resetDiagnosticCounter(): void {
  diagnosticCounter = 0;
}

export function validateHeader(
  table: TableName,
  actualHeaders: string[],
): GraphDiagnostic[] {
  const expected = table === "node" ? NODE_HEADERS : table === "fact" ? FACT_HEADERS : table === "combine" ? COMBINE_HEADERS : [];
  if (table === "gt" || headersEqual(actualHeaders, [...expected])) return [];

  const missing = expected.filter((header) => !actualHeaders.includes(header));
  const extra = actualHeaders.filter((header) => !expected.includes(header as never));
  const orderIssues = expected
    .map((header, index) => (actualHeaders[index] !== header ? `${index + 1}:${actualHeaders[index] ?? "(missing)"}→${header}` : ""))
    .filter(Boolean);

  return [
    createDiagnostic({
      checkNo: "0",
      severity: "error",
      type: "header_mismatch",
      message: `${table} header mismatch. missing=[${missing.join(", ") || "-"}], extra=[${extra.join(", ") || "-"}], order=[${orderIssues.join(", ") || "-"}]`,
      relatedIds: [],
      rowRefs: [{ table, rowIndex: 1 }],
      suggestedFix: `Use exact ${table} header order: ${expected.join(", ")}`,
    }),
  ];
}

export function runAllDiagnostics(input: ParsedWorkbook, gt?: GtTable): GraphDiagnostic[] {
  resetDiagnosticCounter();
  const diagnostics: GraphDiagnostic[] = [...(input.headerDiagnostics ?? [])];
  const nodeMap = new Map(input.nodes.map((node) => [node.id, node]));
  const factMap = new Map(input.facts.map((fact) => [fact.id, fact]));
  const combineMap = new Map(input.combines.map((combine) => [combine.id, combine]));

  diagnostics.push(...validateBasicFormat(input.nodes, input.facts, input.combines));
  diagnostics.push(...validateRelationships(input.nodes, factMap));
  diagnostics.push(...validateReferences(input.nodes, input.facts, input.combines, nodeMap, factMap, combineMap));
  diagnostics.push(...validateProducerParserLinks(input.nodes, input.facts, nodeMap, factMap));
  diagnostics.push(...validateRequirementConsumerLinks(input.nodes, input.facts, combineMap));
  diagnostics.push(...validateCombineStructure(input.nodes, input.combines, combineMap));
  diagnostics.push(...validateExternalConsistency(input.facts));
  diagnostics.push(...validateReachability(input));
  diagnostics.push(...validateGt(input.nodes, gt));

  return diagnostics;
}

function validateBasicFormat(nodes: AttackNode[], facts: Fact[], combines: Combine[]): GraphDiagnostic[] {
  const diagnostics: GraphDiagnostic[] = [];
  diagnostics.push(...validateDuplicates("node", nodes.map((node) => ({ id: node.id, rowIndex: node.rowIndex }))));
  diagnostics.push(...validateDuplicates("fact", facts.map((fact) => ({ id: fact.id, rowIndex: fact.rowIndex }))));
  diagnostics.push(...validateDuplicates("combine", combines.map((combine) => ({ id: combine.id, rowIndex: combine.rowIndex }))));

  for (const node of nodes) {
    if (!NODE_ID_RE.test(node.id)) diagnostics.push(rowDiagnostic("1", "invalid_id", "node", node.rowIndex, "node_id", `${node.id} is not a valid node_id.`, [node.id], "Use N followed by digits, e.g. N01."));
    if (!ALLOWED_TACTICS.includes(node.tactic as never)) diagnostics.push(rowDiagnostic("1", "invalid_tactic", "node", node.rowIndex, "tactic", `${node.id} tactic is not allowed: "${node.tactic}".`, [node.id]));
    if (node.techniqueId && !TECHNIQUE_ID_RE.test(node.techniqueId)) diagnostics.push(rowDiagnostic("1", "invalid_id", "node", node.rowIndex, "technique_id", `${node.id} technique_id is invalid: "${node.techniqueId}".`, [node.id]));
  }

  for (const fact of facts) {
    if (!FACT_ID_RE.test(fact.id)) diagnostics.push(rowDiagnostic("1", "invalid_id", "fact", fact.rowIndex, "fact_id", `${fact.id} is not a valid fact_id.`, [fact.id], "Use F followed by digits and optional lowercase suffix, e.g. F23a."));
    if (!ALLOWED_IS_EXTERNAL.includes(fact.isExternalRaw as never)) diagnostics.push(rowDiagnostic("1", "invalid_is_external", "fact", fact.rowIndex, "is_external", `${fact.id} is_external must be TRUE or FALSE: "${fact.isExternalRaw}".`, [fact.id]));
    if (!ALLOWED_LEVELS.includes(fact.level as never)) diagnostics.push(rowDiagnostic("1", "invalid_level", "fact", fact.rowIndex, "level", `${fact.id} level is not allowed: "${fact.level}".`, [fact.id]));
  }

  for (const combine of combines) {
    if (!COMBINE_ID_RE.test(combine.id)) diagnostics.push(rowDiagnostic("1", "invalid_id", "combine", combine.rowIndex, "combine_id", `${combine.id} is not a valid combine_id.`, [combine.id], "Use C followed by digits, e.g. C01."));
    if (!ALLOWED_OPERATORS.includes(combine.operator as never)) diagnostics.push(rowDiagnostic("1", "invalid_operator", "combine", combine.rowIndex, "operator", `${combine.id} operator must be AND or OR: "${combine.operator}".`, [combine.id]));
  }

  return diagnostics;
}

function validateDuplicates(
  table: "node" | "fact" | "combine",
  rows: Array<{ id: string; rowIndex: number }>,
): GraphDiagnostic[] {
  const seen = new Map<string, number>();
  const diagnostics: GraphDiagnostic[] = [];
  for (const row of rows) {
    if (seen.has(row.id)) {
      diagnostics.push(rowDiagnostic("1", "duplicate_id", table, row.rowIndex, `${table}_id`, `${row.id} is duplicated in ${table} table.`, [row.id]));
    } else {
      seen.set(row.id, row.rowIndex);
    }
  }
  return diagnostics;
}

function validateRelationships(nodes: AttackNode[], factMap: Map<string, Fact>): GraphDiagnostic[] {
  const diagnostics: GraphDiagnostic[] = [];
  for (const node of nodes) {
    for (const relationship of node.relationships) {
      if (!relationship.verb || !relationship.source || !relationship.target || !relationship.isCanonical) {
        diagnostics.push(rowDiagnostic("1b", "invalid_relationship_format", "node", node.rowIndex, "relationships", `${node.id} relationship format is invalid or non-canonical: "${relationship.raw}".`, [node.id], "Use verb(Fxx → Fyy) or verb(— → Fxx)."));
      }
      const rawVerb = relationship.raw.match(/^\s*([a-zA-Z_]+)/)?.[1];
      if (rawVerb && !ALLOWED_RELATIONSHIP_VERBS.includes(rawVerb as never)) {
        diagnostics.push(rowDiagnostic("1b", "invalid_relationship_verb", "node", node.rowIndex, "relationships", `${node.id} relationship verb is not allowed: "${rawVerb}".`, [node.id]));
      }
      for (const endpoint of [relationship.source, relationship.target]) {
        if (endpoint && endpoint !== "—" && !factMap.has(endpoint)) {
          diagnostics.push(rowDiagnostic("1b", "missing_reference", "node", node.rowIndex, "relationships", `${node.id} relationship references missing fact ${endpoint}.`, [node.id, endpoint]));
        }
      }
    }
  }
  return diagnostics;
}

function validateReferences(
  nodes: AttackNode[],
  facts: Fact[],
  combines: Combine[],
  nodeMap: Map<string, AttackNode>,
  factMap: Map<string, Fact>,
  combineMap: Map<string, Combine>,
): GraphDiagnostic[] {
  const diagnostics: GraphDiagnostic[] = [];

  for (const node of nodes) {
    diagnostics.push(...validateRawReferenceKinds("2", "node", node.rowIndex, "requirements", parseIdsFromCell(node.raw.requirements), ["fact", "combine"], node.id));
    diagnostics.push(...validateRawReferenceKinds("2", "node", node.rowIndex, "parsers", parseIdsFromCell(node.raw.parsers), ["fact"], node.id));
    diagnostics.push(...validateReferenceList("2", "node", node.rowIndex, "requirements", node.requirements, ["fact", "combine"], nodeMap, factMap, combineMap, node.id));
    diagnostics.push(...validateReferenceList("2", "node", node.rowIndex, "parsers", node.parsers, ["fact"], nodeMap, factMap, combineMap, node.id));
  }
  for (const fact of facts) {
    diagnostics.push(...validateRawReferenceKinds("2", "fact", fact.rowIndex, "producers", parseIdsFromCell(fact.raw.producers), ["node"], fact.id));
    diagnostics.push(...validateRawReferenceKinds("2", "fact", fact.rowIndex, "consumers", parseIdsFromCell(fact.raw.consumers), ["node"], fact.id));
    diagnostics.push(...validateReferenceList("2", "fact", fact.rowIndex, "producers", fact.producers, ["node"], nodeMap, factMap, combineMap, fact.id));
    diagnostics.push(...validateReferenceList("2", "fact", fact.rowIndex, "consumers", fact.consumers, ["node"], nodeMap, factMap, combineMap, fact.id));
  }
  for (const combine of combines) {
    diagnostics.push(...validateRawReferenceKinds("2", "combine", combine.rowIndex, "members", parseIdsFromCell(combine.raw.members), ["fact", "combine"], combine.id));
    diagnostics.push(...validateRawReferenceKinds("2", "combine", combine.rowIndex, "consumer", parseIdsFromCell(combine.raw.consumer), ["node", "combine"], combine.id));
    diagnostics.push(...validateReferenceList("2", "combine", combine.rowIndex, "members", combine.members, ["fact", "combine"], nodeMap, factMap, combineMap, combine.id));
    diagnostics.push(...validateReferenceList("2", "combine", combine.rowIndex, "consumer", combine.consumer, ["node", "combine"], nodeMap, factMap, combineMap, combine.id));
  }

  return diagnostics;
}

function validateRawReferenceKinds(
  checkNo: GraphDiagnostic["checkNo"],
  table: "node" | "fact" | "combine",
  rowIndex: number,
  column: string,
  ids: string[],
  allowedKinds: Array<"node" | "fact" | "combine">,
  ownerId: string,
): GraphDiagnostic[] {
  return ids.flatMap((id) => {
    const kind = classifyId(id);
    if (allowedKinds.includes(kind as never)) return [];
    return [
      rowDiagnostic(
        checkNo,
        "wrong_reference_type",
        table,
        rowIndex,
        column,
        `${ownerId}.${column} contains wrong reference type: ${id}.`,
        [ownerId, id],
      ),
    ];
  });
}

function validateReferenceList(
  checkNo: GraphDiagnostic["checkNo"],
  table: "node" | "fact" | "combine",
  rowIndex: number,
  column: string,
  ids: string[],
  allowedKinds: Array<"node" | "fact" | "combine">,
  nodeMap: Map<string, AttackNode>,
  factMap: Map<string, Fact>,
  combineMap: Map<string, Combine>,
  ownerId: string,
): GraphDiagnostic[] {
  const diagnostics: GraphDiagnostic[] = [];
  for (const id of ids) {
    const kind = classifyId(id);
    if (!allowedKinds.includes(kind as never)) {
      diagnostics.push(rowDiagnostic(checkNo, "wrong_reference_type", table, rowIndex, column, `${ownerId}.${column} contains wrong reference type: ${id}.`, [ownerId, id]));
      continue;
    }
    const exists = kind === "node" ? nodeMap.has(id) : kind === "fact" ? factMap.has(id) : kind === "combine" ? combineMap.has(id) : false;
    if (!exists) {
      diagnostics.push(rowDiagnostic(checkNo, "missing_reference", table, rowIndex, column, `${ownerId}.${column} references missing ${id}.`, [ownerId, id]));
    }
  }
  return diagnostics;
}

function validateProducerParserLinks(
  nodes: AttackNode[],
  facts: Fact[],
  nodeMap: Map<string, AttackNode>,
  factMap: Map<string, Fact>,
): GraphDiagnostic[] {
  const diagnostics: GraphDiagnostic[] = [];
  for (const fact of facts) {
    for (const producerId of fact.producers) {
      const node = nodeMap.get(producerId);
      if (node && !node.parsers.includes(fact.id)) {
        diagnostics.push(rowDiagnostic("3", "producer_parser_mismatch", "fact", fact.rowIndex, "producers", `${fact.id}.producers contains ${producerId}, but ${producerId}.parsers does not contain ${fact.id}.`, [fact.id, producerId]));
      }
    }
  }
  for (const node of nodes) {
    for (const parserFactId of node.parsers) {
      const fact = factMap.get(parserFactId);
      if (fact && !fact.producers.includes(node.id)) {
        diagnostics.push(rowDiagnostic("3", "producer_parser_mismatch", "node", node.rowIndex, "parsers", `${node.id}.parsers contains ${parserFactId}, but ${parserFactId}.producers does not contain ${node.id}.`, [node.id, parserFactId]));
      }
    }
  }
  return diagnostics;
}

function validateRequirementConsumerLinks(
  nodes: AttackNode[],
  facts: Fact[],
  combineMap: Map<string, Combine>,
): GraphDiagnostic[] {
  const diagnostics: GraphDiagnostic[] = [];
  const factMap = new Map(facts.map((fact) => [fact.id, fact]));
  const nodeLeafFacts = new Map<string, string[]>();

  for (const node of nodes) {
    const expansion = expandRequirementToLeafFacts(node.requirements, combineMap);
    nodeLeafFacts.set(node.id, expansion.facts);
    for (const factId of expansion.facts) {
      const fact = factMap.get(factId);
      if (fact && !fact.consumers.includes(node.id)) {
        diagnostics.push(rowDiagnostic("3b", "requirement_consumer_mismatch", "node", node.rowIndex, "requirements", `${node.id} requires leaf fact ${factId}, but ${factId}.consumers does not contain ${node.id}.`, [node.id, factId]));
      }
    }
  }

  for (const fact of facts) {
    for (const consumerId of fact.consumers) {
      const leafFacts = nodeLeafFacts.get(consumerId) ?? [];
      if (!leafFacts.includes(fact.id)) {
        diagnostics.push(rowDiagnostic("3b", "requirement_consumer_mismatch", "fact", fact.rowIndex, "consumers", `${fact.id}.consumers contains ${consumerId}, but ${consumerId}.requirements leaf facts do not contain ${fact.id}.`, [fact.id, consumerId]));
      }
    }
  }

  return diagnostics;
}

function validateCombineStructure(
  nodes: AttackNode[],
  combines: Combine[],
  combineMap: Map<string, Combine>,
): GraphDiagnostic[] {
  const diagnostics: GraphDiagnostic[] = [];
  for (const node of nodes) {
    if (node.requirements.length > 1) {
      diagnostics.push(rowDiagnostic("4", "multi_requirement_without_combine", "node", node.rowIndex, "requirements", `${node.id} has multiple requirement IDs without a combine: ${node.requirements.join(", ")}.`, [node.id, ...node.requirements], "Create an AND/OR Combine row and reference only that combine from requirements."));
    }
  }

  for (const combine of combines) {
    if (combine.members.length <= 1) diagnostics.push(rowDiagnostic("4", "invalid_combine", "combine", combine.rowIndex, "members", `${combine.id} must have at least 2 members.`, [combine.id]));
    if (combine.consumer.length !== 1) diagnostics.push(rowDiagnostic("4", "invalid_combine", "combine", combine.rowIndex, "consumer", `${combine.id} must have exactly 1 consumer.`, [combine.id]));
    const rawMemberIds = parseIdsFromCell(combine.raw.members);
    for (const id of rawMemberIds) {
      if (id.startsWith("N")) diagnostics.push(rowDiagnostic("4", "wrong_reference_type", "combine", combine.rowIndex, "members", `${combine.id}.members must not contain node_id ${id}.`, [combine.id, id]));
    }
    const expanded = expandCombineToLeafFacts(combine.id, combineMap);
    if (expanded.hasCycle) {
      diagnostics.push(rowDiagnostic("4", "combine_cycle", "combine", combine.rowIndex, "members", `${combine.id} has combine cycle: ${expanded.path.join(" → ")}.`, expanded.path));
    }
  }
  return diagnostics;
}

function validateExternalConsistency(facts: Fact[]): GraphDiagnostic[] {
  const diagnostics: GraphDiagnostic[] = [];
  for (const fact of facts) {
    if (fact.isExternal === true && fact.producers.length > 0) diagnostics.push(rowDiagnostic("5", "external_producer_conflict", "fact", fact.rowIndex, "producers", `${fact.id} is external TRUE but has producers: ${fact.producers.join(", ")}.`, [fact.id, ...fact.producers]));
    if (fact.isExternal === false && fact.producers.length === 0) diagnostics.push(rowDiagnostic("5", "internal_without_producer", "fact", fact.rowIndex, "producers", `${fact.id} is external FALSE but has no producers.`, [fact.id]));
  }
  return diagnostics;
}

function validateReachability(input: ParsedWorkbook): GraphDiagnostic[] {
  const result = runReachabilitySimulation(input);
  const diagnostics: GraphDiagnostic[] = [];
  for (const nodeId of result.unreachableNodes) {
    diagnostics.push(createDiagnostic({
      checkNo: "6",
      severity: "error",
      type: "unreachable_node",
      message: `Unreachable node: ${nodeId}.`,
      relatedIds: [nodeId],
      suggestedFix: "Check requirements, combine logic, and upstream parser/producer links.",
    }));
  }
  for (const factId of result.unproducibleFacts) {
    diagnostics.push(createDiagnostic({
      checkNo: "6",
      severity: "error",
      type: "unproducible_fact",
      message: `Unproducible internal fact: ${factId}.`,
      relatedIds: [factId],
      suggestedFix: "Ensure a producer node is reachable and lists this fact in parsers.",
    }));
  }
  return diagnostics;
}

function validateGt(nodes: AttackNode[], gt?: GtTable): GraphDiagnostic[] {
  if (!gt) {
    return [
      createDiagnostic({
        checkNo: "7",
        severity: "info",
        type: "technique_gt_missing_in_answer",
        message: "GT not provided. Technique comparison skipped.",
        relatedIds: [],
      }),
    ];
  }

  const diagnostics: GraphDiagnostic[] = [];
  const answerIds = new Map(nodes.map((node) => [node.techniqueId, node.techniqueName]));
  const gtIds = new Map(gt.techniques.map((technique) => [technique.techniqueId, technique.techniqueName]));

  for (const [techniqueId, techniqueName] of answerIds) {
    if (!gtIds.has(techniqueId)) {
      diagnostics.push(createDiagnostic({ checkNo: "7", severity: "error", type: "technique_gt_extra_in_answer", message: `Answer contains technique not in GT: ${techniqueId}.`, relatedIds: nodes.filter((node) => node.techniqueId === techniqueId).map((node) => node.id) }));
    } else if (gtIds.get(techniqueId) !== techniqueName) {
      diagnostics.push(createDiagnostic({ checkNo: "7", severity: "error", type: "technique_name_mismatch", message: `${techniqueId} technique_name mismatch. answer="${techniqueName}", gt="${gtIds.get(techniqueId)}".`, relatedIds: nodes.filter((node) => node.techniqueId === techniqueId).map((node) => node.id), suggestedFix: `Use GT technique_name: ${gtIds.get(techniqueId)}` }));
    }
  }

  for (const [techniqueId] of gtIds) {
    if (!answerIds.has(techniqueId)) {
      diagnostics.push(createDiagnostic({ checkNo: "7", severity: "error", type: "technique_gt_missing_in_answer", message: `GT technique missing in answer: ${techniqueId}.`, relatedIds: [] }));
    }
  }
  return diagnostics;
}

function headersEqual(actual: string[], expected: string[]): boolean {
  return actual.length === expected.length && expected.every((header, index) => actual[index] === header);
}

function rowDiagnostic(
  checkNo: GraphDiagnostic["checkNo"],
  type: GraphDiagnostic["type"],
  table: "node" | "fact" | "combine",
  rowIndex: number,
  column: string,
  message: string,
  relatedIds: string[],
  suggestedFix?: string,
): GraphDiagnostic {
  return createDiagnostic({
    checkNo,
    severity: "error",
    type,
    message,
    relatedIds,
    rowRefs: [{ table, rowIndex, column }],
    suggestedFix,
  });
}
