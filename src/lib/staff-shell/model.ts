import type {
  AccessDecision,
  AccessFacts,
  AccessRequirement,
} from "@/lib/access";
import { evaluateAccess, isCurrentAccessIdentity } from "@/lib/access";
import type {
  BranchId,
  GymStaffRole,
  MembershipId,
  PermissionKey,
  WorkspaceId,
  WorkspaceMembershipRole,
} from "@/contracts";
import { isGymStaffRole, isMyWorkspaceDto } from "@/contracts";
import type { AuthorizationCacheContext } from "@/lib/server-state";

export const staffShellPortal = "gym-staff" as const;

export interface StaffWorkspaceOption {
  accessVersion?: number;
  membershipId: MembershipId;
  roles: readonly GymStaffRole[];
  workspaceId: WorkspaceId;
  workspaceName: string;
  workspaceTimezone: string;
}

export interface StaffBranchContext {
  branchId: BranchId | null;
  label: string;
}

export interface StaffShellContext {
  accessContext: AuthorizationCacheContext;
  branch: StaffBranchContext;
  portal: typeof staffShellPortal;
  sessionGeneration: number;
  workspace: StaffWorkspaceOption;
}

export type StaffShellAccessStatus =
  "allowed" | "denied" | "disabled" | "unavailable" | "unresolved";

export interface StaffShellNavItem {
  description: string;
  href?: string;
  id: StaffShellNavItemId;
  permission?: PermissionKey | readonly PermissionKey[];
  status: StaffShellAccessStatus;
  title: string;
}

export type StaffShellNavItemId =
  | "overview"
  | "workspace"
  | "staff"
  | "leads"
  | "relationships"
  | "training"
  | "nutrition"
  | "progress"
  | "documents"
  | "notifications"
  | "analytics";

export interface StaffShellNavigationInput {
  accessFacts?: AccessFacts | null;
  context: StaffShellContext | null;
  labels: Record<StaffShellNavItemId, { description: string; title: string }>;
}

const futureNavItems = [
  "workspace",
  "staff",
  "leads",
  "relationships",
  "training",
  "nutrition",
  "progress",
  "documents",
  "notifications",
  "analytics",
] as const satisfies readonly StaffShellNavItemId[];

const permissionByNavItem: Partial<Record<StaffShellNavItemId, PermissionKey>> =
  {
    analytics: "dashboard.gym.read",
    documents: "documents.read",
    leads: "billing.subscription.read",
    nutrition: "nutrition.plans.read",
    progress: "measurements.read",
    relationships: "trainees.read",
    staff: "staff.read",
    training: "programs.read",
    workspace: "workspace.read",
  };

const nutritionNavPermissions = [
  "nutrition.plans.read",
  "foods.read",
  "adherence.read",
  "analytics.nutrition.read",
] as const satisfies readonly PermissionKey[];

const progressNavPermissions = [
  "measurements.read",
  "adherence.read",
  "progress_photos.read",
  "health.read",
  "health.food_allergies.read",
  "notes.read",
  "checkins.read",
  "analytics.progress.read",
  "analytics.adherence.read",
] as const satisfies readonly PermissionKey[];

const implementedNavItems: Partial<Record<StaffShellNavItemId, string>> = {
  documents: "/app/documents",
  leads: "/app/leads",
  nutrition: "/app/nutrition",
  notifications: "/app/notifications",
  progress: "/app/progress",
  relationships: "/app/relationships",
  training: "/app/training",
  workspace: "/app/workspace",
};

export function selectStaffWorkspaces(
  workspaces: readonly unknown[],
): StaffWorkspaceOption[] {
  const selected: StaffWorkspaceOption[] = [];

  for (const item of workspaces.filter(isMyWorkspaceDto)) {
    const roles = item.membership.roles.filter(isGymStaffRole);

    if (
      item.workspace.status !== "ACTIVE" ||
      item.membership.status !== "ACTIVE" ||
      roles.length === 0
    ) {
      continue;
    }

    selected.push({
      accessVersion: item.membership.accessVersion,
      membershipId: item.membership.id,
      roles,
      workspaceId: item.workspace.id,
      workspaceName: item.workspace.name,
      workspaceTimezone: item.workspace.timezone,
    });
  }

  return selected;
}

export function isStaffExperienceRole(
  role: WorkspaceMembershipRole,
): role is GymStaffRole {
  return isGymStaffRole(role);
}

export function createStaffShellContext(input: {
  accessContext?: AuthorizationCacheContext;
  branchId?: BranchId | null;
  branchLabel: string;
  sessionGeneration: number;
  workspace: StaffWorkspaceOption;
}): StaffShellContext {
  return {
    accessContext: input.accessContext ?? "user",
    branch: {
      branchId: input.branchId ?? null,
      label: input.branchLabel,
    },
    portal: staffShellPortal,
    sessionGeneration: input.sessionGeneration,
    workspace: input.workspace,
  };
}

export function createStaffNavigation({
  accessFacts,
  context,
  labels,
}: StaffShellNavigationInput): StaffShellNavItem[] {
  const overview = {
    description: labels.overview.description,
    href: "/app",
    id: "overview",
    status: "allowed",
    title: labels.overview.title,
  } satisfies StaffShellNavItem;

  if (context === null) {
    return [overview];
  }

  return [
    overview,
    ...futureNavItems.map((id) => {
      const href = implementedNavItems[id];
      const permission = permissionByNavItem[id];
      const status =
        id === "notifications"
          ? notificationAccessStatus(accessFacts, context)
          : id === "nutrition"
            ? aggregateAccessStatus(
                nutritionNavPermissions.map((item) =>
                  accessStatus(
                    evaluateAccess(
                      accessFacts,
                      accessRequirement(context, item),
                    ),
                  ),
                ),
              )
            : id === "progress"
              ? aggregateAccessStatus(
                  progressNavPermissions.map((item) =>
                    accessStatus(
                      evaluateAccess(
                        accessFacts,
                        accessRequirement(context, item),
                      ),
                    ),
                  ),
                )
              : permission === undefined
                ? href === undefined
                  ? "disabled"
                  : "allowed"
                : accessStatus(
                    evaluateAccess(
                      accessFacts,
                      accessRequirement(context, permission),
                    ),
                  );

      return {
        description: labels[id].description,
        href,
        id,
        permission:
          id === "nutrition"
            ? nutritionNavPermissions
            : id === "progress"
              ? progressNavPermissions
              : permission,
        status,
        title: labels[id].title,
      } satisfies StaffShellNavItem;
    }),
  ];
}

function notificationAccessStatus(
  facts: AccessFacts | null | undefined,
  context: StaffShellContext,
): StaffShellAccessStatus {
  if (context.accessContext !== "user") return "denied";
  if (!facts || facts.status === "unresolved") return "unresolved";
  if (facts.status === "error") return "unavailable";
  return isCurrentAccessIdentity(facts, {
    accessContext: context.accessContext,
    membershipId: context.workspace.membershipId,
    sessionGeneration: context.sessionGeneration,
    workspaceId: context.workspace.workspaceId,
  })
    ? "allowed"
    : "unresolved";
}

export function accessRequirement(
  context: StaffShellContext,
  permission: PermissionKey,
): AccessRequirement {
  return {
    accessContext: context.accessContext,
    context: "WORKSPACE",
    permission,
    scope: context.branch.branchId === null ? "workspace" : "branch",
    sessionGeneration: context.sessionGeneration,
    membershipId: context.workspace.membershipId,
    workspaceId: context.workspace.workspaceId,
    ...(context.branch.branchId === null
      ? {}
      : { branchId: context.branch.branchId }),
  };
}

function accessStatus(decision: AccessDecision): StaffShellAccessStatus {
  if (decision.status === "allowed") {
    return "allowed";
  }

  if (decision.status === "denied") {
    return "denied";
  }

  if (decision.status === "unavailable") {
    return "unavailable";
  }

  return "unresolved";
}

function aggregateAccessStatus(
  statuses: readonly StaffShellAccessStatus[],
): StaffShellAccessStatus {
  if (statuses.includes("allowed")) {
    return "allowed";
  }

  if (statuses.includes("unavailable")) {
    return "unavailable";
  }

  if (statuses.includes("unresolved")) {
    return "unresolved";
  }

  if (statuses.includes("denied")) {
    return "denied";
  }

  return "disabled";
}
