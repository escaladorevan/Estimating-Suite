import type { Estimate } from "@/types";

type ReconcilePersistedEstimateIdentityInput = {
  currentEstimates: Estimate[];
  persistedEstimates: Estimate[];
  activeEstimateId: string;
};

export type ReconciledPersistedEstimateIdentity = {
  estimates: Estimate[];
  activeEstimateId: string;
  localToPersistedEstimateIds: Map<string, string>;
};

export function reconcilePersistedEstimateIdentity({
  currentEstimates,
  persistedEstimates,
  activeEstimateId
}: ReconcilePersistedEstimateIdentityInput): ReconciledPersistedEstimateIdentity {
  const persistedByOpportunityId = new Map(
    persistedEstimates.filter((estimate) => estimate.opportunityId).map((estimate) => [estimate.opportunityId, estimate])
  );
  const persistedByProposalNumber = new Map(
    persistedEstimates
      .filter((estimate) => estimate.proposalNumber)
      .map((estimate) => [normalize(estimate.proposalNumber ?? ""), estimate])
  );
  const localToPersistedEstimateIds = new Map<string, string>();
  const mergedByPersistedId = new Map<string, Estimate>();

  for (const local of currentEstimates) {
    const persisted =
      (local.opportunityId ? persistedByOpportunityId.get(local.opportunityId) : undefined) ??
      (local.proposalNumber ? persistedByProposalNumber.get(normalize(local.proposalNumber)) : undefined);

    if (!persisted) continue;
    if (local.id !== persisted.id) {
      localToPersistedEstimateIds.set(local.id, persisted.id);
    }

    mergedByPersistedId.set(persisted.id, {
      ...persisted,
      areas: persisted.areas.length ? persisted.areas : local.areas,
      subItems: persisted.subItems.length ? persisted.subItems : local.subItems,
      alternates: persisted.alternates.length ? persisted.alternates : local.alternates
    });
  }

  const matchedPersistedIds = new Set(mergedByPersistedId.keys());
  const matchedLocalIds = new Set(localToPersistedEstimateIds.keys());
  const estimates = [
    ...persistedEstimates.map((estimate) => mergedByPersistedId.get(estimate.id) ?? estimate),
    ...currentEstimates.filter((estimate) => !matchedLocalIds.has(estimate.id) && !matchedPersistedIds.has(estimate.id))
  ];

  return {
    estimates,
    activeEstimateId: localToPersistedEstimateIds.get(activeEstimateId) ?? activeEstimateId,
    localToPersistedEstimateIds
  };
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}
