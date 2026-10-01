export const contractConfidenceLevels = [
  "VERIFIED_FROM_IMPLEMENTATION",
  "VERIFIED_FROM_OPENAPI_AND_IMPLEMENTATION",
  "DOCUMENTED_BEHAVIOR_NOT_FULLY_EXPRESSED_IN_OPENAPI",
  "PROVIDER_DEPENDENT",
  "UNVERIFIED_FOLLOW_UP",
] as const;

export type ContractConfidenceLevel = (typeof contractConfidenceLevels)[number];

const contractConfidenceLevelSet = new Set<string>(contractConfidenceLevels);

export function isContractConfidenceLevel(
  value: string | null | undefined,
): value is ContractConfidenceLevel {
  return typeof value === "string" && contractConfidenceLevelSet.has(value);
}
