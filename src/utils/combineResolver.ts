import type { Combine } from "../types/graph";

export function expandRequirementToLeafFacts(
  requirementIds: string[],
  combines: Map<string, Combine>,
): {
  facts: string[];
  cycles: string[][];
  missingRefs: string[];
} {
  const facts = new Set<string>();
  const cycles: string[][] = [];
  const missingRefs: string[] = [];

  for (const id of requirementIds) {
    if (id.startsWith("F")) {
      facts.add(id);
    } else if (id.startsWith("C")) {
      const result = expandCombineToLeafFacts(id, combines);
      result.facts.forEach((fact) => facts.add(fact));
      if (result.hasCycle) cycles.push(result.path);
      result.missingRefs.forEach((ref) => missingRefs.push(ref));
    }
  }

  return { facts: [...facts], cycles, missingRefs };
}

export function expandCombineToLeafFacts(
  combineId: string,
  combines: Map<string, Combine>,
): {
  facts: string[];
  hasCycle: boolean;
  path: string[];
  missingRefs: string[];
} {
  const facts = new Set<string>();
  const missingRefs: string[] = [];
  const cyclePath: string[] = [];

  const visit = (id: string, stack: string[]): boolean => {
    if (stack.includes(id)) {
      cyclePath.push(...stack.slice(stack.indexOf(id)), id);
      return true;
    }

    const combine = combines.get(id);
    if (!combine) {
      missingRefs.push(id);
      return false;
    }

    let hasCycle = false;
    for (const member of combine.members) {
      if (member.startsWith("F")) facts.add(member);
      if (member.startsWith("C")) hasCycle = visit(member, [...stack, id]) || hasCycle;
    }
    return hasCycle;
  };

  const hasCycle = visit(combineId, []);
  return { facts: [...facts], hasCycle, path: cyclePath, missingRefs };
}

export function evaluateCombine(
  combineId: string,
  availableFacts: Set<string>,
  combines: Map<string, Combine>,
): boolean {
  return evaluateCombineInternal(combineId, availableFacts, combines, new Set());
}

function evaluateCombineInternal(
  combineId: string,
  availableFacts: Set<string>,
  combines: Map<string, Combine>,
  visiting: Set<string>,
): boolean {
  if (visiting.has(combineId)) return false;
  const combine = combines.get(combineId);
  if (!combine) return false;

  visiting.add(combineId);
  const memberResults = combine.members.map((member) => {
    if (member.startsWith("F")) return availableFacts.has(member);
    if (member.startsWith("C")) return evaluateCombineInternal(member, availableFacts, combines, new Set(visiting));
    return false;
  });
  visiting.delete(combineId);

  if (combine.operator === "AND") return memberResults.length > 0 && memberResults.every(Boolean);
  if (combine.operator === "OR") return memberResults.some(Boolean);
  return false;
}
