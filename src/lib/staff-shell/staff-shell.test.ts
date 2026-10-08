import { describe, expect, test } from "vitest";
import type {
  BranchId,
  MembershipId,
  MyWorkspaceDto,
  PermissionDecisionDto,
  WorkspaceId,
} from "@/contracts";
import {
  accessRequirement,
  createStaffNavigation,
  createStaffShellContext,
  isStaffExperienceRole,
  selectStaffWorkspaces,
} from ".";
import { accessFactsFromDecision } from "@/lib/access";

const workspaceA = "workspace_a" as WorkspaceId;
const workspaceB = "workspace_b" as WorkspaceId;
const membershipA = "membership_a" as MembershipId;
const branchA = "branch_a" as BranchId;
const branchB = "branch_b" as BranchId;

describe("staff shell model", () => {
  test("selects active gym staff memberships without treating trainee as staff", () => {
    const selected = selectStaffWorkspaces([
      myWorkspace({
        roles: ["TRAINEE"],
        workspaceId: workspaceA,
        workspaceName: "Trainee workspace",
      }),
      myWorkspace({
        roles: ["TRAINER", "TRAINEE"],
        workspaceId: workspaceB,
        workspaceName: "Staff workspace",
      }),
      myWorkspace({
        membershipStatus: "SUSPENDED",
        roles: ["GYM_MANAGER"],
        workspaceId: "workspace_suspended" as WorkspaceId,
        workspaceName: "Suspended workspace",
      }),
    ]);

    expect(selected).toHaveLength(1);
    expect(selected[0]).toMatchObject({
      roles: ["TRAINER"],
      workspaceId: workspaceB,
      workspaceName: "Staff workspace",
    });
    expect(isStaffExperienceRole("TRAINEE")).toBe(false);
  });

  test("role alone does not authorize protected navigation", () => {
    const workspace = selectStaffWorkspaces([
      myWorkspace({ roles: ["GYM_OWNER"], workspaceId: workspaceA }),
    ])[0];
    const context = createStaffShellContext({
      branchLabel: "All branches",
      sessionGeneration: 1,
      workspace,
    });
    const nav = createStaffNavigation({
      accessFacts: accessFactsFromDecision({
        decisions: [],
        membershipId: membershipA,
        sessionGeneration: 1,
        workspaceId: workspaceA,
      }),
      context,
      labels: navLabels,
    });

    expect(nav.find((item) => item.id === "overview")).toMatchObject({
      status: "allowed",
    });
    expect(nav.find((item) => item.id === "staff")).toMatchObject({
      status: "denied",
    });
  });

  test("Backend effective permission facts drive navigation without role maps", () => {
    const workspace = selectStaffWorkspaces([
      myWorkspace({ roles: ["TRAINER"], workspaceId: workspaceA }),
    ])[0];
    const context = createStaffShellContext({
      branchLabel: "All branches",
      sessionGeneration: 1,
      workspace,
    });
    const nav = createStaffNavigation({
      accessFacts: accessFactsFromDecision({
        decisions: [decision("staff.read", true, "ALLOW")],
        membershipId: membershipA,
        sessionGeneration: 1,
        workspaceId: workspaceA,
      }),
      context,
      labels: navLabels,
    });

    expect(nav.find((item) => item.id === "staff")).toMatchObject({
      status: "allowed",
    });
  });

  test("nutrition navigation uses any frozen read permission instead of plan-read only", () => {
    const workspace = selectStaffWorkspaces([
      myWorkspace({ roles: ["NUTRITIONIST"], workspaceId: workspaceA }),
    ])[0];
    const context = createStaffShellContext({
      branchLabel: "All branches",
      sessionGeneration: 1,
      workspace,
    });
    const nav = createStaffNavigation({
      accessFacts: accessFactsFromDecision({
        decisions: [
          decision("nutrition.plans.read", false, "DENY"),
          decision("foods.read", true, "ALLOW"),
          decision("adherence.read", false, "DENY"),
          decision("analytics.nutrition.read", false, "DENY"),
        ],
        membershipId: membershipA,
        sessionGeneration: 1,
        workspaceId: workspaceA,
      }),
      context,
      labels: navLabels,
    });

    expect(nav.find((item) => item.id === "nutrition")).toMatchObject({
      href: "/app/nutrition",
      permission: [
        "nutrition.plans.read",
        "foods.read",
        "adherence.read",
        "analytics.nutrition.read",
      ],
      status: "allowed",
    });
  });

  test("progress navigation uses any frozen readable panel permission", () => {
    const workspace = selectStaffWorkspaces([
      myWorkspace({ roles: ["TRAINER"], workspaceId: workspaceA }),
    ])[0];
    const context = createStaffShellContext({
      branchLabel: "All branches",
      sessionGeneration: 1,
      workspace,
    });
    const nav = createStaffNavigation({
      accessFacts: accessFactsFromDecision({
        decisions: [
          decision("measurements.read", false, "DENY"),
          decision("adherence.read", false, "DENY"),
          decision("progress_photos.read", false, "DENY"),
          decision("health.read", false, "DENY"),
          decision("health.food_allergies.read", true, "ALLOW"),
          decision("notes.read", false, "DENY"),
          decision("checkins.read", false, "DENY"),
          decision("analytics.progress.read", false, "DENY"),
          decision("analytics.adherence.read", false, "DENY"),
        ],
        membershipId: membershipA,
        sessionGeneration: 1,
        workspaceId: workspaceA,
      }),
      context,
      labels: navLabels,
    });

    expect(nav.find((item) => item.id === "progress")).toMatchObject({
      href: "/app/progress",
      permission: [
        "measurements.read",
        "adherence.read",
        "progress_photos.read",
        "health.read",
        "health.food_allergies.read",
        "notes.read",
        "checkins.read",
        "analytics.progress.read",
        "analytics.adherence.read",
      ],
      status: "allowed",
    });
  });

  test("commercial route metadata uses billing access, not platform lead access", () => {
    const workspace = selectStaffWorkspaces([
      myWorkspace({ roles: ["TRAINER"], workspaceId: workspaceA }),
    ])[0];
    const context = createStaffShellContext({
      branchLabel: "All branches",
      sessionGeneration: 1,
      workspace,
    });
    const nav = createStaffNavigation({
      accessFacts: accessFactsFromDecision({
        decisions: [decision("leads.read", true, "ALLOW")],
        membershipId: membershipA,
        sessionGeneration: 1,
        workspaceId: workspaceA,
      }),
      context,
      labels: navLabels,
    });

    expect(nav.find((item) => item.id === "leads")).toMatchObject({
      href: "/app/leads",
      permission: "billing.subscription.read",
    });
  });

  test("same access facts produce identical protected navigation for different staff roles", () => {
    const trainer = selectStaffWorkspaces([
      myWorkspace({ roles: ["TRAINER"], workspaceId: workspaceA }),
    ])[0];
    const owner = selectStaffWorkspaces([
      myWorkspace({ roles: ["GYM_OWNER"], workspaceId: workspaceA }),
    ])[0];
    const accessFacts = accessFactsFromDecision({
      decisions: [decision("staff.read", false, "DENY")],
      membershipId: membershipA,
      sessionGeneration: 1,
      workspaceId: workspaceA,
    });

    const trainerNav = createStaffNavigation({
      accessFacts,
      context: createStaffShellContext({
        branchLabel: "All branches",
        sessionGeneration: 1,
        workspace: trainer,
      }),
      labels: navLabels,
    });
    const ownerNav = createStaffNavigation({
      accessFacts,
      context: createStaffShellContext({
        branchLabel: "All branches",
        sessionGeneration: 1,
        workspace: owner,
      }),
      labels: navLabels,
    });

    expect(ownerNav.find((item) => item.id === "staff")?.status).toBe(
      trainerNav.find((item) => item.id === "staff")?.status,
    );
    expect(ownerNav.find((item) => item.id === "staff")).toMatchObject({
      status: "denied",
    });
  });

  test("malformed workspace contract data cannot create staff shell context", () => {
    const selected = selectStaffWorkspaces([
      {
        membership: {
          ...myWorkspace({ roles: ["GYM_OWNER"], workspaceId: workspaceA })
            .membership,
          roles: ["GYM_OWNER", "NOT_A_BACKEND_ROLE"],
        },
        workspace: myWorkspace({
          roles: ["GYM_OWNER"],
          workspaceId: workspaceA,
        }).workspace,
      },
      {
        membership: {
          ...myWorkspace({ roles: ["GYM_MANAGER"], workspaceId: workspaceB })
            .membership,
          id: undefined,
        },
        workspace: myWorkspace({
          roles: ["GYM_MANAGER"],
          workspaceId: workspaceB,
        }).workspace,
      },
    ]);

    expect(selected).toEqual([]);
  });

  test("session workspace and support contexts fail closed when stale", () => {
    const workspace = selectStaffWorkspaces([
      myWorkspace({ roles: ["GYM_MANAGER"], workspaceId: workspaceA }),
    ])[0];
    const contextB = createStaffShellContext({
      branchLabel: "All branches",
      sessionGeneration: 2,
      workspace: { ...workspace, workspaceId: workspaceB },
    });
    const nav = createStaffNavigation({
      accessFacts: accessFactsFromDecision({
        decisions: [decision("staff.read", true, "ALLOW")],
        membershipId: membershipA,
        sessionGeneration: 1,
        workspaceId: workspaceA,
      }),
      context: contextB,
      labels: navLabels,
    });

    expect(nav.find((item) => item.id === "staff")).toMatchObject({
      status: "unresolved",
    });

    const supportContext = createStaffShellContext({
      accessContext: "support",
      branchLabel: "All branches",
      sessionGeneration: 1,
      workspace,
    });
    const supportNav = createStaffNavigation({
      accessFacts: accessFactsFromDecision({
        accessContext: "user",
        decisions: [decision("staff.read", true, "ALLOW")],
        membershipId: membershipA,
        sessionGeneration: 1,
        workspaceId: workspaceA,
      }),
      context: supportContext,
      labels: navLabels,
    });

    expect(supportNav.find((item) => item.id === "staff")).toMatchObject({
      status: "unresolved",
    });
  });

  test("exposes notifications only for a resolved current user staff identity without inventing a permission", () => {
    const workspace = selectStaffWorkspaces([
      myWorkspace({ roles: ["TRAINER"], workspaceId: workspaceA }),
    ])[0];
    const context = createStaffShellContext({
      branchLabel: "All",
      sessionGeneration: 1,
      workspace,
    });
    const ready = createStaffNavigation({
      accessFacts: accessFactsFromDecision({
        decisions: [],
        membershipId: membershipA,
        sessionGeneration: 1,
        workspaceId: workspaceA,
      }),
      context,
      labels: navLabels,
    }).find((item) => item.id === "notifications");
    expect(ready).toMatchObject({
      href: "/app/notifications",
      permission: undefined,
      status: "allowed",
    });

    const supportContext = createStaffShellContext({
      accessContext: "support",
      branchLabel: "All",
      sessionGeneration: 1,
      workspace,
    });
    const support = createStaffNavigation({
      accessFacts: accessFactsFromDecision({
        accessContext: "support",
        decisions: [],
        membershipId: membershipA,
        sessionGeneration: 1,
        workspaceId: workspaceA,
      }),
      context: supportContext,
      labels: navLabels,
    }).find((item) => item.id === "notifications");
    expect(support).toMatchObject({ status: "denied" });
  });

  test("branch context stays scoped to the selected branch", () => {
    const workspace = selectStaffWorkspaces([
      myWorkspace({ roles: ["GYM_MANAGER"], workspaceId: workspaceA }),
    ])[0];
    const context = createStaffShellContext({
      branchId: branchB,
      branchLabel: "Branch B",
      sessionGeneration: 1,
      workspace,
    });
    const requirement = accessRequirement(context, "branches.update");

    expect(requirement).toMatchObject({
      branchId: branchB,
      scope: "branch",
      workspaceId: workspaceA,
    });
    expect(requirement.branchId).not.toBe(branchA);
  });
});

function myWorkspace(input: {
  membershipStatus?: MyWorkspaceDto["membership"]["status"];
  roles: MyWorkspaceDto["membership"]["roles"];
  workspaceId: WorkspaceId;
  workspaceName?: string;
}): MyWorkspaceDto {
  return {
    membership: {
      accessVersion: 1,
      engagementPeriods: [],
      id: membershipA,
      joinedAt: "2026-01-01T00:00:00.000Z",
      permissionProfileIds: [],
      roles: input.roles,
      status: input.membershipStatus ?? "ACTIVE",
      userId: "user_a" as MyWorkspaceDto["membership"]["userId"],
      workspaceId: input.workspaceId,
    },
    workspace: {
      defaultLanguage: "en",
      id: input.workspaceId,
      name: input.workspaceName ?? "Workspace",
      ownerUserId: "user_owner" as MyWorkspaceDto["workspace"]["ownerUserId"],
      status: "ACTIVE",
      timezone: "Africa/Cairo",
      type: "GYM",
    },
  };
}

function decision(
  permission: PermissionDecisionDto["permission"],
  allowed: boolean,
  effect: PermissionDecisionDto["effect"],
): PermissionDecisionDto {
  return {
    allowed,
    effect,
    permission,
    source: "PROFILE",
  };
}

const navLabels = {
  analytics: { description: "Analytics", title: "Analytics" },
  documents: { description: "Documents", title: "Documents" },
  leads: { description: "Leads", title: "Leads" },
  notifications: { description: "Notifications", title: "Notifications" },
  nutrition: { description: "Nutrition", title: "Nutrition" },
  overview: { description: "Overview", title: "Overview" },
  progress: { description: "Progress", title: "Progress" },
  relationships: { description: "Relationships", title: "Relationships" },
  staff: { description: "Staff", title: "Staff" },
  training: { description: "Training", title: "Training" },
  workspace: { description: "Workspace", title: "Workspace" },
};
