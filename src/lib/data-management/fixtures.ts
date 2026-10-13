export const id = "1234567890abcdef12345678",
  at = "2026-10-13T00:00:00.000Z";
export const exportRow = {
  id,
  workspaceId: id,
  requestedByUserId: id,
  status: "PENDING",
  requestedAt: at,
  format: "ZIP_JSON_V1",
  manifestVersion: 1,
  version: 0,
};
export const deletionRow = {
  id,
  workspaceId: id,
  subscriptionId: id,
  status: "PENDING_APPROVAL",
  eligibilityBasis: { expiredAt: at, eligibilityAt: at },
  version: 0,
  createdAt: at,
  updatedAt: at,
};
