import { ALLOWED_TACTICS } from "../constants/allowedValues";
import type { ViewerCombine, ViewerData, ViewerReqItem } from "./types";

export type ValidationSeverity = "error" | "warning" | "info";

export type ValidationEntityType = "workbook" | "node" | "fact" | "combine" | "edge";

export type WorkbookSheetKind = "node" | "fact" | "combine";

export type ValidationIssueCode =
  | "schema.missing_column"
  | "schema.extra_column"
  | "schema.column_order"
  | "id.invalid_node_id"
  | "id.invalid_fact_id"
  | "id.invalid_combine_id"
  | "id.invalid_technique_id"
  | "id.duplicate"
  | "value.invalid_tactic"
  | "value.invalid_operator"
  | "value.invalid_is_external"
  | "value.invalid_level"
  | "ref.missing"
  | "ref.wrong_type"
  | "consistency.parser_producer_mismatch"
  | "consistency.requirement_consumer_mismatch"
  | "combine.too_few_members"
  | "combine.cycle"
  | "combine.unresolved_terminal"
  | "reachability.unsatisfied_requirement"
  | "reachability.unreachable_node";

export interface ValidationIssue {
  id: string;
  severity: ValidationSeverity;
  code: ValidationIssueCode;
  message: string;
  entityType?: ValidationEntityType;
  entityId?: string;
  field?: string;
  relatedIds?: string[];
}

export interface ValidationSummary {
  total: number;
  errors: number;
  warnings: number;
  infos: number;
}

export interface ValidationResult {
  issues: ValidationIssue[];
  summary: ValidationSummary;
}

export const NODE_ID_RE = /^N\d+$/;
export const FACT_ID_RE = /^F\d+$/;
export const COMBINE_ID_RE = /^C\d+$/;
export const TECHNIQUE_ID_RE = /^T\d+(\.\d+)?$/;

const TACTIC_BY_NORMALIZED = new Map(ALLOWED_TACTICS.map((tactic) => [normalizeEnumValue(tactic), tactic]));
const ALLOWED_LEVELS = new Set(["report_explicit", "execution_required"]);
const BOOLEAN_TRUE_VALUES = new Set(["true", "1", "yes"]);
const BOOLEAN_FALSE_VALUES = new Set(["false", "0", "no"]);
const EMPTY_CELL_MARKERS = new Set(["", "-", "—", "–", "none", "null", "n/a", "na"]);
const OPTIONAL_WORKBOOK_COLUMNS: Partial<Record<WorkbookSheetKind, string[]>> = {
  fact: ["ref"],
};

export const EXPECTED_WORKBOOK_COLUMNS: Record<WorkbookSheetKind, string[]> = {
  node: ["node_id", "tactic", "technique_id", "technique_name", "behavior_summary", "requirements", "relationships", "parsers", "ref"],
  fact: ["fact_id", "name", "producers", "consumers", "is_external", "level", "description"],
  combine: ["combine_id", "operator", "members", "consumer", "label"],
};

export function normalizeEnumValue(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

export function isEmptyCellValue(value: unknown): boolean {
  return EMPTY_CELL_MARKERS.has(normalizeEnumValue(value));
}

export function normalizeTactic(value: unknown): string | null {
  return TACTIC_BY_NORMALIZED.get(normalizeEnumValue(value)) ?? null;
}

function hasValidTacticList(value: unknown): boolean {
  const tactics = splitList(value);
  return tactics.length > 0 && tactics.every((tactic) => normalizeTactic(tactic));
}

export function parseBooleanCell(value: unknown): boolean | null {
  const normalized = normalizeEnumValue(value);
  if (BOOLEAN_TRUE_VALUES.has(normalized)) return true;
  if (BOOLEAN_FALSE_VALUES.has(normalized)) return false;
  return null;
}

export function summarizeValidationIssues(issues: ValidationIssue[]): ValidationSummary {
  return {
    total: issues.length,
    errors: issues.filter((issue) => issue.severity === "error").length,
    warnings: issues.filter((issue) => issue.severity === "warning").length,
    infos: issues.filter((issue) => issue.severity === "info").length,
  };
}

export function validateWorkbookHeaders(
  kind: WorkbookSheetKind,
  fileName: string,
  rawHeaders: string[],
): ValidationIssue[] {
  const expected = EXPECTED_WORKBOOK_COLUMNS[kind];
  const optional = OPTIONAL_WORKBOOK_COLUMNS[kind] ?? [];
  const headers = rawHeaders.map((header) => normalizeEnumValue(header));
  const headerSet = new Set(headers.filter(Boolean));
  const knownSet = new Set([...expected, ...optional]);
  const issues: ValidationIssue[] = [];
  let index = 0;

  expected.forEach((column) => {
    if (headerSet.has(column)) return;
    index += 1;
    issues.push({
      id: `schema.${kind}.${index}`,
      severity: "error",
      code: "schema.missing_column",
      message: `${fileName} is missing required column ${column}`,
      entityType: "workbook",
      entityId: kind,
      field: column,
    });
  });

  headers
    .filter((column) => column && !knownSet.has(column))
    .forEach((column) => {
      index += 1;
      issues.push({
        id: `schema.${kind}.${index}`,
        severity: "warning",
        code: "schema.extra_column",
        message: `${fileName} has unexpected column ${column}`,
        entityType: "workbook",
        entityId: kind,
        field: column,
      });
    });

  const missingColumns = expected.filter((column) => !headerSet.has(column));
  const expectedSet = new Set(expected);
  const presentExpectedColumns = headers.filter((column) => expectedSet.has(column));
  const expectedPresentOrder = expected.filter((column) => headerSet.has(column));
  if (missingColumns.length === 0 && presentExpectedColumns.join("\u0000") !== expectedPresentOrder.join("\u0000")) {
    index += 1;
    issues.push({
      id: `schema.${kind}.${index}`,
      severity: "warning",
      code: "schema.column_order",
      message: `${fileName} column order differs from the canonical ${kind} schema`,
      entityType: "workbook",
      entityId: kind,
      field: "header",
      relatedIds: expected,
    });
  }

  return issues;
}

export function validateWorkbookRows(
  kind: WorkbookSheetKind,
  fileName: string,
  rows: Array<Record<string, string>>,
): ValidationIssue[] {
  if (kind !== "fact") return [];

  const issues: ValidationIssue[] = [];
  rows.forEach((row, index) => {
    if (!Object.prototype.hasOwnProperty.call(row, "is_external")) return;
    const rawValue = row.is_external;
    if (parseBooleanCell(rawValue) !== null) return;

    const rowNumber = index + 2;
    const factId = (row.fact_id || `row ${rowNumber}`).trim();
    issues.push({
      id: `value.fact.${rowNumber}.is_external`,
      severity: "error",
      code: "value.invalid_is_external",
      message: `${fileName} row ${rowNumber} has invalid is_external value for ${factId}: ${rawValue || "(empty)"}`,
      entityType: "fact",
      entityId: factId,
      field: "is_external",
    });
  });

  return issues;
}

export function validateWorkbookDataRows(input: {
  nodeRows: Array<Record<string, string>>;
  factRows: Array<Record<string, string>>;
  combineRows: Array<Record<string, string>>;
}): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  let issueIndex = 0;
  const addIssue = (issue: Omit<ValidationIssue, "id">): void => {
    issueIndex += 1;
    issues.push({ ...issue, id: `workbook.${issue.code}:${issueIndex}` });
  };

  const nodeIds = new Set(input.nodeRows.map((row) => row.node_id?.trim()).filter(Boolean));
  const factIds = new Set(input.factRows.map((row) => row.fact_id?.trim()).filter(Boolean));
  const factNames = new Set(input.factRows.map((row) => row.name?.trim()).filter(Boolean));
  const combineIds = new Set(input.combineRows.map((row) => row.combine_id?.trim()).filter(Boolean));

  reportDuplicates(input.factRows.map((row) => row.fact_id), "fact", addIssue);
  reportDuplicates(input.combineRows.map((row) => row.combine_id), "combine", addIssue);

  input.nodeRows.forEach((row) => {
    const nodeId = row.node_id?.trim() || "(unknown node)";
    splitIds(row.requirements).forEach((refId) => {
      if (FACT_ID_RE.test(refId)) {
        if (!factIds.has(refId)) {
          addIssue({
            severity: "error",
            code: "ref.missing",
            message: `${nodeId} requirement references missing fact ${refId}`,
            entityType: "node",
            entityId: nodeId,
            field: "requirements",
            relatedIds: [refId],
          });
        }
        return;
      }
      if (COMBINE_ID_RE.test(refId)) {
        if (!combineIds.has(refId)) {
          addIssue({
            severity: "error",
            code: "ref.missing",
            message: `${nodeId} requirement references missing combine ${refId}`,
            entityType: "node",
            entityId: nodeId,
            field: "requirements",
            relatedIds: [refId],
          });
        }
        return;
      }
      addIssue({
        severity: "error",
        code: "ref.wrong_type",
        message: `${nodeId} has invalid requirement reference ${refId}`,
        entityType: "node",
        entityId: nodeId,
        field: "requirements",
        relatedIds: [refId],
      });
    });

    splitIds(row.parsers).forEach((token) => {
      if (FACT_ID_RE.test(token)) {
        if (!factIds.has(token)) {
          addIssue({
            severity: "error",
            code: "ref.missing",
            message: `${nodeId} parser references missing fact ${token}`,
            entityType: "node",
            entityId: nodeId,
            field: "parsers",
            relatedIds: [token],
          });
        }
        return;
      }
      if (!factNames.has(token)) {
        addIssue({
          severity: "error",
          code: "ref.missing",
          message: `${nodeId} parser references missing fact name ${token}`,
          entityType: "node",
          entityId: nodeId,
          field: "parsers",
          relatedIds: [token],
        });
      }
    });
  });

  return issues;
}

export function validateViewerData(data: ViewerData): ValidationResult {
  const issues: ValidationIssue[] = [];
  let issueIndex = 0;
  const addIssue = (issue: Omit<ValidationIssue, "id">): void => {
    issueIndex += 1;
    issues.push({ ...issue, id: `${issue.code}:${issueIndex}` });
  };

  const nodes = Array.isArray(data.nodes) ? data.nodes : [];
  const facts = Object.values(data.facts || {});
  const combines = Array.isArray(data.combines) ? data.combines : [];
  const nodeIds = new Set(nodes.map((node) => node.node_id).filter(Boolean));
  const factIds = new Set(facts.map((fact) => fact.fact_id).filter(Boolean));
  const combineIds = new Set(combines.map((combine) => combine.combine_id).filter(Boolean));
  const combineById = new Map(combines.map((combine) => [combine.combine_id, combine]));

  reportDuplicates(nodes.map((node) => node.node_id), "node", addIssue);
  reportDuplicates(facts.map((fact) => fact.fact_id), "fact", addIssue);
  reportDuplicates(combines.map((combine) => combine.combine_id), "combine", addIssue);

  nodes.forEach((node) => {
    if (!NODE_ID_RE.test(node.node_id || "")) {
      addIssue({
        severity: "error",
        code: "id.invalid_node_id",
        message: `Invalid node ID: ${node.node_id || "(empty)"}`,
        entityType: "node",
        entityId: node.node_id,
        field: "node_id",
      });
    }
    if (node.technique_id && !TECHNIQUE_ID_RE.test(node.technique_id)) {
      addIssue({
        severity: "error",
        code: "id.invalid_technique_id",
        message: `Invalid technique ID for ${node.node_id}: ${node.technique_id}`,
        entityType: "node",
        entityId: node.node_id,
        field: "technique_id",
      });
    }
    if (!isEmptyCellValue(node.tactic) && !hasValidTacticList(node.tactic)) {
      addIssue({
        severity: "error",
        code: "value.invalid_tactic",
        message: `Invalid tactic for ${node.node_id}: ${node.tactic}`,
        entityType: "node",
        entityId: node.node_id,
        field: "tactic",
      });
    }
    (node.parsers || []).forEach((parser) => {
      const factId = parser.fact_id || "";
      if (!FACT_ID_RE.test(factId)) {
        addIssue({
          severity: "error",
          code: "id.invalid_fact_id",
          message: `Invalid parser fact ID for ${node.node_id}: ${factId || "(empty)"}`,
          entityType: "node",
          entityId: node.node_id,
          field: "parsers",
          relatedIds: factId ? [factId] : undefined,
        });
      } else if (!factIds.has(factId)) {
        addIssue({
          severity: "error",
          code: "ref.missing",
          message: `${node.node_id} parser references missing fact ${factId}`,
          entityType: "node",
          entityId: node.node_id,
          field: "parsers",
          relatedIds: [factId],
        });
      }
    });
    collectRequirementFactIds(node.requirements).forEach((factId) => {
      if (!FACT_ID_RE.test(factId)) {
        addIssue({
          severity: "error",
          code: "id.invalid_fact_id",
          message: `Invalid requirement fact ID for ${node.node_id}: ${factId}`,
          entityType: "node",
          entityId: node.node_id,
          field: "requirements",
          relatedIds: [factId],
        });
      } else if (!factIds.has(factId)) {
        addIssue({
          severity: "error",
          code: "ref.missing",
          message: `${node.node_id} requirement references missing fact ${factId}`,
          entityType: "node",
          entityId: node.node_id,
          field: "requirements",
          relatedIds: [factId],
        });
      }
    });
  });

  facts.forEach((fact) => {
    const factId = fact.fact_id || "";
    if (!FACT_ID_RE.test(factId)) {
      addIssue({
        severity: "error",
        code: "id.invalid_fact_id",
        message: `Invalid fact ID: ${factId || "(empty)"}`,
        entityType: "fact",
        entityId: factId,
        field: "fact_id",
      });
    }
    if (fact.level && !ALLOWED_LEVELS.has(fact.level)) {
      addIssue({
        severity: "error",
        code: "value.invalid_level",
        message: `Invalid level for ${factId}: ${fact.level}`,
        entityType: "fact",
        entityId: factId,
        field: "level",
      });
    }
    if (typeof fact.is_external !== "boolean") {
      addIssue({
        severity: "warning",
        code: "value.invalid_is_external",
        message: `${factId} should declare is_external as true or false`,
        entityType: "fact",
        entityId: factId,
        field: "is_external",
      });
    }
    splitIds(fact.producers).forEach((nodeId) => {
      if (!NODE_ID_RE.test(nodeId)) {
        addIssue({
          severity: "error",
          code: "id.invalid_node_id",
          message: `${factId} has invalid producer node ID ${nodeId}`,
          entityType: "fact",
          entityId: factId,
          field: "producers",
          relatedIds: [nodeId],
        });
      } else if (!nodeIds.has(nodeId)) {
        addIssue({
          severity: "error",
          code: "ref.missing",
          message: `${factId} producer references missing node ${nodeId}`,
          entityType: "fact",
          entityId: factId,
          field: "producers",
          relatedIds: [nodeId],
        });
      }
    });
    splitIds(fact.consumers).forEach((consumerId) => {
      if (NODE_ID_RE.test(consumerId)) {
        if (!nodeIds.has(consumerId)) {
          addIssue({
            severity: "error",
            code: "ref.missing",
            message: `${factId} consumer references missing node ${consumerId}`,
            entityType: "fact",
            entityId: factId,
            field: "consumers",
            relatedIds: [consumerId],
          });
        }
      } else if (COMBINE_ID_RE.test(consumerId)) {
        if (!combineIds.has(consumerId)) {
          addIssue({
            severity: "error",
            code: "ref.missing",
            message: `${factId} consumer references missing combine ${consumerId}`,
            entityType: "fact",
            entityId: factId,
            field: "consumers",
            relatedIds: [consumerId],
          });
        }
      } else {
        addIssue({
          severity: "error",
          code: "ref.wrong_type",
          message: `${factId} has invalid consumer reference ${consumerId}`,
          entityType: "fact",
          entityId: factId,
          field: "consumers",
          relatedIds: [consumerId],
        });
      }
    });
    const producerIds = splitIds(fact.producers);
    if (fact.is_external === true && producerIds.length > 0) {
      addIssue({
        severity: "warning",
        code: "value.invalid_is_external",
        message: `${factId} is external but also declares producers`,
        entityType: "fact",
        entityId: factId,
        field: "is_external",
        relatedIds: producerIds,
      });
    }
  });

  combines.forEach((combine) => {
    const combineId = combine.combine_id || "";
    const members = splitIds(combine.members);
    const operator = String(combine.operator || "").trim().toUpperCase();
    if (!COMBINE_ID_RE.test(combineId)) {
      addIssue({
        severity: "error",
        code: "id.invalid_combine_id",
        message: `Invalid combine ID: ${combineId || "(empty)"}`,
        entityType: "combine",
        entityId: combineId,
        field: "combine_id",
      });
    }
    if (operator !== "AND" && operator !== "OR") {
      addIssue({
        severity: "error",
        code: "value.invalid_operator",
        message: `Invalid operator for ${combineId}: ${combine.operator || "(empty)"}`,
        entityType: "combine",
        entityId: combineId,
        field: "operator",
      });
    }
    if (members.length < 2) {
      addIssue({
        severity: "warning",
        code: "combine.too_few_members",
        message: `${combineId} should contain at least two members`,
        entityType: "combine",
        entityId: combineId,
        field: "members",
      });
    }
    members.forEach((memberId) => {
      if (FACT_ID_RE.test(memberId)) {
        if (!factIds.has(memberId)) {
          addIssue({
            severity: "error",
            code: "ref.missing",
            message: `${combineId} references missing fact ${memberId}`,
            entityType: "combine",
            entityId: combineId,
            field: "members",
            relatedIds: [memberId],
          });
        }
      } else if (COMBINE_ID_RE.test(memberId)) {
        if (!combineIds.has(memberId)) {
          addIssue({
            severity: "error",
            code: "ref.missing",
            message: `${combineId} references missing combine ${memberId}`,
            entityType: "combine",
            entityId: combineId,
            field: "members",
            relatedIds: [memberId],
          });
        }
      } else {
        addIssue({
          severity: "error",
          code: "ref.wrong_type",
          message: `${combineId} has invalid member reference ${memberId}`,
          entityType: "combine",
          entityId: combineId,
          field: "members",
          relatedIds: [memberId],
        });
      }
    });
    validateCombineConsumer(combine, nodeIds, combineIds, addIssue);
  });

  detectCombineCycles(combines, addIssue);
  validateConsistency(data, combineById, addIssue);
  validateReachability(data, addIssue);

  return { issues, summary: summarizeValidationIssues(issues) };
}

function reportDuplicates(
  ids: string[],
  entityType: "node" | "fact" | "combine",
  addIssue: (issue: Omit<ValidationIssue, "id">) => void,
): void {
  const seen = new Set<string>();
  const reported = new Set<string>();
  ids.map((id) => String(id || "").trim()).filter((id) => !isEmptyCellValue(id)).forEach((id) => {
    if (!seen.has(id)) {
      seen.add(id);
      return;
    }
    if (reported.has(id)) return;
    reported.add(id);
    addIssue({
      severity: "error",
      code: "id.duplicate",
      message: `Duplicate ${entityType} ID: ${id}`,
      entityType,
      entityId: id,
    });
  });
}

function splitIds(value: string[] | string | undefined): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter((item) => !isEmptyCellValue(item));
  return splitList(value);
}

function splitList(value: unknown): string[] {
  return String(value || "")
    .split(/[,;]+/)
    .map((item) => item.trim())
    .filter((item) => !isEmptyCellValue(item));
}

function collectRequirementFactIds(items: ViewerReqItem[] | undefined): string[] {
  const facts: string[] = [];
  const visit = (item: ViewerReqItem): void => {
    if (item.type === "fact") {
      if (item.fact_id) facts.push(item.fact_id);
      return;
    }
    (item.members || []).forEach(visit);
  };
  (items || []).forEach(visit);
  return [...new Set(facts)];
}

function validateCombineConsumer(
  combine: ViewerCombine,
  nodeIds: Set<string>,
  combineIds: Set<string>,
  addIssue: (issue: Omit<ValidationIssue, "id">) => void,
): void {
  const consumerId = combine.consumer || "";
  if (!consumerId) {
    addIssue({
      severity: "error",
      code: "combine.unresolved_terminal",
      message: `${combine.combine_id} has no consumer`,
      entityType: "combine",
      entityId: combine.combine_id,
      field: "consumer",
    });
    return;
  }
  if (NODE_ID_RE.test(consumerId)) {
    if (!nodeIds.has(consumerId)) {
      addIssue({
        severity: "error",
        code: "ref.missing",
        message: `${combine.combine_id} consumer references missing node ${consumerId}`,
        entityType: "combine",
        entityId: combine.combine_id,
        field: "consumer",
        relatedIds: [consumerId],
      });
    }
    return;
  }
  if (COMBINE_ID_RE.test(consumerId)) {
    if (!combineIds.has(consumerId)) {
      addIssue({
        severity: "error",
        code: "ref.missing",
        message: `${combine.combine_id} consumer references missing combine ${consumerId}`,
        entityType: "combine",
        entityId: combine.combine_id,
        field: "consumer",
        relatedIds: [consumerId],
      });
    }
    return;
  }
  addIssue({
    severity: "error",
    code: "ref.wrong_type",
    message: `${combine.combine_id} has invalid consumer reference ${consumerId}`,
    entityType: "combine",
    entityId: combine.combine_id,
    field: "consumer",
    relatedIds: [consumerId],
  });
}

function detectCombineCycles(
  combines: ViewerCombine[],
  addIssue: (issue: Omit<ValidationIssue, "id">) => void,
): void {
  const combineById = new Map(combines.map((combine) => [combine.combine_id, combine]));
  const reported = new Set<string>();
  const visit = (combineId: string, stack: string[]): void => {
    if (stack.includes(combineId)) {
      const cycle = [...stack.slice(stack.indexOf(combineId)), combineId];
      const key = cycle.join(">");
      if (!reported.has(key)) {
        reported.add(key);
        addIssue({
          severity: "error",
          code: "combine.cycle",
          message: `Combine cycle detected: ${cycle.join(" -> ")}`,
          entityType: "combine",
          entityId: combineId,
          field: "members",
          relatedIds: cycle,
        });
      }
      return;
    }
    const combine = combineById.get(combineId);
    if (!combine) return;
    splitIds(combine.members)
      .filter((memberId) => COMBINE_ID_RE.test(memberId))
      .forEach((memberId) => visit(memberId, [...stack, combineId]));
  };
  combines.forEach((combine) => visit(combine.combine_id, []));
}

function validateConsistency(
  data: ViewerData,
  combineById: Map<string, ViewerCombine>,
  addIssue: (issue: Omit<ValidationIssue, "id">) => void,
): void {
  const factsById = new Map(Object.values(data.facts || {}).map((fact) => [fact.fact_id, fact]));
  const requirementFactsByNode = new Map(
    (data.nodes || []).map((node) => [node.node_id, new Set(collectRequirementFactIds(node.requirements))]),
  );

  (data.nodes || []).forEach((node) => {
    (node.parsers || []).forEach((parser) => {
      const factId = parser.fact_id || "";
      if (!FACT_ID_RE.test(factId)) return;
      const fact = factsById.get(factId);
      if (fact && !(fact.producers || []).includes(node.node_id)) {
        addIssue({
          severity: "warning",
          code: "consistency.parser_producer_mismatch",
          message: `${node.node_id} parses ${factId}, but ${factId}.producers does not include ${node.node_id}`,
          entityType: "node",
          entityId: node.node_id,
          field: "parsers",
          relatedIds: [factId],
        });
      }
    });
    collectRequirementFactIds(node.requirements).forEach((factId) => {
      const fact = factsById.get(factId);
      if (!fact || factReachesNode(fact, node.node_id, combineById)) return;
      addIssue({
        severity: "warning",
        code: "consistency.requirement_consumer_mismatch",
        message: `${node.node_id} requires ${factId}, but ${factId}.consumers does not reach ${node.node_id}`,
        entityType: "node",
        entityId: node.node_id,
        field: "requirements",
        relatedIds: [factId],
      });
    });
  });

  factsById.forEach((fact) => {
    (fact.consumers || []).forEach((consumerId) => {
      const terminal = NODE_ID_RE.test(consumerId) ? consumerId : terminalNodeForCombine(consumerId, combineById);
      if (!terminal) return;
      const nodeRequirements = requirementFactsByNode.get(terminal);
      if (nodeRequirements && !nodeRequirements.has(fact.fact_id)) {
        addIssue({
          severity: "warning",
          code: "consistency.requirement_consumer_mismatch",
          message: `${fact.fact_id}.consumers reaches ${terminal}, but ${terminal}.requirements does not include ${fact.fact_id}`,
          entityType: "fact",
          entityId: fact.fact_id,
          field: "consumers",
          relatedIds: [terminal],
        });
      }
    });
  });
}

function factReachesNode(
  fact: { consumers?: string[] },
  nodeId: string,
  combineById: Map<string, ViewerCombine>,
): boolean {
  return (fact.consumers || []).some((consumerId) => {
    if (consumerId === nodeId) return true;
    return terminalNodeForCombine(consumerId, combineById) === nodeId;
  });
}

function terminalNodeForCombine(combineId: string, combineById: Map<string, ViewerCombine>): string | null {
  let current = combineId;
  const seen = new Set<string>();
  while (COMBINE_ID_RE.test(current) && combineById.has(current) && !seen.has(current)) {
    seen.add(current);
    const consumer = combineById.get(current)?.consumer || "";
    if (NODE_ID_RE.test(consumer)) return consumer;
    current = consumer;
  }
  return null;
}

function validateReachability(
  data: ViewerData,
  addIssue: (issue: Omit<ValidationIssue, "id">) => void,
): void {
  const facts = Object.values(data.facts || {});
  const availableFacts = new Set(facts.filter((fact) => fact.is_external === true).map((fact) => fact.fact_id));
  const reachedNodes = new Set<string>();
  let changed = true;

  while (changed) {
    changed = false;
    for (const node of data.nodes || []) {
      if (reachedNodes.has(node.node_id)) continue;
      const requiredFacts = collectRequirementFactIds(node.requirements);
      if (requiredFacts.every((factId) => availableFacts.has(factId))) {
        reachedNodes.add(node.node_id);
        changed = true;
        facts.forEach((fact) => {
          if ((fact.producers || []).includes(node.node_id) && !availableFacts.has(fact.fact_id)) {
            availableFacts.add(fact.fact_id);
            changed = true;
          }
        });
        (node.parsers || []).forEach((parser) => {
          if (parser.fact_id) availableFacts.add(parser.fact_id);
        });
      }
    }
  }

  for (const node of data.nodes || []) {
    if (reachedNodes.has(node.node_id)) continue;
    const missing = collectRequirementFactIds(node.requirements).filter((factId) => !availableFacts.has(factId));
    addIssue({
      severity: "warning",
      code: missing.length > 0 ? "reachability.unsatisfied_requirement" : "reachability.unreachable_node",
      message:
        missing.length > 0
          ? `${node.node_id} has unsatisfied required facts: ${missing.join(", ")}`
          : `${node.node_id} is not reachable from the external facts`,
      entityType: "node",
      entityId: node.node_id,
      field: "requirements",
      relatedIds: missing.length > 0 ? missing : undefined,
    });
  }
}
