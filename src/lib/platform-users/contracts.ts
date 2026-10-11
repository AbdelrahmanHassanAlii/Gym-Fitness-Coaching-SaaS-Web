export const accountStatuses = [
  "PENDING_ACTIVATION",
  "ACTIVE",
  "SUSPENDED",
  "LOCKED",
  "DEACTIVATED",
] as const;
export const membershipStatuses = ["ACTIVE", "SUSPENDED", "ENDED"] as const;
export type AccountStatus = (typeof accountStatuses)[number];
export type MembershipStatus = (typeof membershipStatuses)[number];
export interface PlatformUserRow {
  id: string;
  displayName?: string;
  email?: string;
  status: AccountStatus;
  createdAt: string;
  platformMembership: { status: MembershipStatus };
}
export interface PlatformUserPage {
  data: PlatformUserRow[];
  meta: { nextCursor: string | null; hasMore: boolean };
}
export interface PlatformUserDetail extends Omit<
  PlatformUserRow,
  "platformMembership"
> {
  updatedAt: string;
  platformMembership: {
    id: string;
    status: MembershipStatus;
    createdAt: string;
    updatedAt: string;
    suspendedAt?: string;
    endedAt?: string;
  };
}
