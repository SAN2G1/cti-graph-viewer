import type { ParsedWorkbook } from "../types/graph";
import { evaluateCombine } from "./combineResolver";

export function runReachabilitySimulation(input: ParsedWorkbook): {
  executedNodes: Set<string>;
  availableFacts: Set<string>;
  unreachableNodes: string[];
  unproducibleFacts: string[];
} {
  const combines = new Map(input.combines.map((combine) => [combine.id, combine]));
  const availableFacts = new Set(input.facts.filter((fact) => fact.isExternal === true).map((fact) => fact.id));
  const executedNodes = new Set<string>();

  let progressed = true;
  while (progressed) {
    progressed = false;

    for (const node of input.nodes) {
      if (executedNodes.has(node.id)) continue;
      if (!isRequirementSatisfied(node.requirements, availableFacts, combines)) continue;

      executedNodes.add(node.id);
      node.parsers.forEach((factId) => availableFacts.add(factId));
      progressed = true;
    }
  }

  return {
    executedNodes,
    availableFacts,
    unreachableNodes: input.nodes.filter((node) => !executedNodes.has(node.id)).map((node) => node.id),
    unproducibleFacts: input.facts
      .filter((fact) => fact.isExternal === false && !availableFacts.has(fact.id))
      .map((fact) => fact.id),
  };
}

function isRequirementSatisfied(
  requirements: string[],
  availableFacts: Set<string>,
  combines: Map<string, import("../types/graph").Combine>,
): boolean {
  if (requirements.length === 0) return true;
  if (requirements.length > 1) return false;
  const [requirement] = requirements;
  if (requirement.startsWith("F")) return availableFacts.has(requirement);
  if (requirement.startsWith("C")) return evaluateCombine(requirement, availableFacts, combines);
  return false;
}
