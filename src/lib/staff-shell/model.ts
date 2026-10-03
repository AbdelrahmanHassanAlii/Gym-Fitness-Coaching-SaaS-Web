import type {
  AccessDecision,
  AccessFacts,
  AccessRequirement,
} from "@/lib/access";
import { evaluateAccess } from "@/lib/access";
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
  permission?: PermissionKey;
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
    leads: "leads.read",
    nutrition: "nutrition.plans.read",
    progress: "measurements.read",
    relationships: "trainees.read",
    staff: "staff.read",
    training: "programs.read",
    workspace: "workspace.read",
  };

const implementedNavItems: Partial<Record<StaffShellNavItemId, string>> = {
  leads: "/app/leads",
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
      const permission = permissionByNavItem[id];
      const href = implementedNavItems[id];
      const status =
        href !== undefined
          ? "allowed"
          : permission === undefined
            ? "disabled"
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
        permission,
        status,
        title: labels[id].title,
      } satisfies StaffShellNavItem;
    }),
  ];
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
