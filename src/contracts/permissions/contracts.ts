import type {
  BranchId,
  MembershipId,
  RelationshipId,
  WorkspaceId,
} from "@/contracts/common/ids";

export const permissionContexts = ["PLATFORM", "WORKSPACE"] as const;
export const permissionEffects = ["ALLOW", "DENY"] as const;
export const currentUserEffectiveAccessContexts = [
  "USER",
  "SUPPORT_USER_CONTEXT",
] as const;
export const currentUserEffectiveAccessScopes = [
  "WORKSPACE",
  "BRANCH",
  "RELATIONSHIP",
] as const;
export const permissionScopeTypes = [
  "SELF",
  "ASSIGNED_TRAINEES",
  "SPECIFIC_TRAINEES",
  "BRANCH",
  "MULTIPLE_BRANCHES",
  "WORKSPACE",
] as const;

export const permissionKeys = [
  "adherence.configure",
  "adherence.correct",
  "adherence.read",
  "adherence.update",
  "analytics.adherence.read",
  "analytics.nutrition.read",
  "analytics.progress.read",
  "analytics.training.read",
  "audit.platform.read",
  "audit.sensitive.read",
  "audit.workspace.read",
  "billing.payments.create",
  "billing.payments.read",
  "billing.subscription.read",
  "billing.usage.read",
  "branches.archive",
  "branches.create",
  "branches.manage",
  "branches.read",
  "branches.update",
  "checkins.assign",
  "checkins.assignments.end",
  "checkins.assignments.read",
  "checkins.assignments.update",
  "checkins.read",
  "checkins.review",
  "checkins.submit",
  "checkins.templates.archive",
  "checkins.templates.create",
  "checkins.templates.read",
  "checkins.templates.update",
  "dashboard.gym.read",
  "dashboard.relationship.read",
  "dashboard.trainer.read",
  "deletion.approve",
  "deletion.cancel",
  "deletion.postpone",
  "deletion.read",
  "documents.delete",
  "documents.read",
  "documents.upload",
  "exercises.archive",
  "exercises.create",
  "exercises.read",
  "exercises.update",
  "exports.workspace.create",
  "exports.workspace.download",
  "exports.workspace.read",
  "files.delete",
  "files.download",
  "files.restore",
  "foods.archive",
  "foods.create",
  "foods.read",
  "foods.update",
  "health.food_allergies.read",
  "health.read",
  "health.update",
  "leads.convert",
  "leads.mark_duplicate",
  "leads.merge",
  "leads.read",
  "leads.update",
  "measurements.create",
  "measurements.read",
  "measurements.update",
  "medical_documents.download",
  "medical_documents.read",
  "medical_documents.upload",
  "metric_definitions.archive",
  "metric_definitions.create",
  "metric_definitions.read",
  "metric_definitions.update",
  "notes.archive",
  "notes.create",
  "notes.read",
  "notes.update",
  "nutrition.plans.activate",
  "nutrition.plans.archive",
  "nutrition.plans.complete",
  "nutrition.plans.create",
  "nutrition.plans.read",
  "nutrition.plans.update",
  "payments.approve",
  "payments.read",
  "payments.reject",
  "personal_records.read",
  "plans.archive",
  "plans.create",
  "plans.read",
  "plans.update",
  "plans.versions.create",
  "platform_permissions.manage",
  "platform_users.manage",
  "platform_users.read",
  "platform_workspaces.manage",
  "program_templates.archive",
  "program_templates.create",
  "program_templates.read",
  "program_templates.update",
  "programs.activate",
  "programs.archive",
  "programs.complete",
  "programs.create",
  "programs.read",
  "programs.update",
  "progress_photos.create",
  "progress_photos.delete",
  "progress_photos.read",
  "progress_photos.update_visibility",
  "staff.branches.manage",
  "staff.invite",
  "staff.invites.revoke",
  "staff.manage",
  "staff.permissions.manage",
  "staff.read",
  "subscriptions.cancel",
  "subscriptions.change_plan",
  "subscriptions.change_terms",
  "subscriptions.freeze",
  "subscriptions.reactivate",
  "subscriptions.read",
  "subscriptions.start_trial",
  "support.policies.archive",
  "support.policies.create",
  "support.policies.disable",
  "support.policies.read",
  "support.policies.update",
  "support.sensitive_files.read",
  "support.sensitive.read",
  "support.sessions.end_own",
  "support.sessions.read",
  "support.sessions.revoke",
  "support.sessions.start",
  "system_exercises.archive",
  "system_exercises.create",
  "system_exercises.read",
  "system_exercises.update",
  "system_foods.archive",
  "system_foods.create",
  "system_foods.read",
  "system_foods.update",
  "trainees.accept",
  "trainees.assignments.assistant.manage",
  "trainees.assignments.nutritionist.manage",
  "trainees.assignments.primary.manage",
  "trainees.end",
  "trainees.invite",
  "trainees.migrate_in",
  "trainees.migrate_out",
  "trainees.reactivate",
  "trainees.read",
  "trainees.reject",
  "trainees.update",
  "workouts.abandon",
  "workouts.complete",
  "workouts.correct",
  "workouts.create",
  "workouts.day.defer",
  "workouts.day.skip",
  "workouts.read",
  "workouts.update",
  "workspace.manage",
  "workspace.read",
  "workspace.update",
] as const;

export type PermissionContext = (typeof permissionContexts)[number];
export type PermissionEffect = (typeof permissionEffects)[number];
export type CurrentUserEffectiveAccessContext =
  (typeof currentUserEffectiveAccessContexts)[number];
export type CurrentUserEffectiveAccessScope =
  (typeof currentUserEffectiveAccessScopes)[number];
export type PermissionScopeType = (typeof permissionScopeTypes)[number];
export type PermissionKey = (typeof permissionKeys)[number];
export type AccessDecisionSource = "EXPLICIT_GRANT" | "PROFILE" | "NONE";

export interface PermissionScopeDto {
  type: PermissionScopeType;
  resourceIds?: readonly string[];
}

export interface PermissionDecisionDto {
  permission: PermissionKey;
  effect: PermissionEffect;
  allowed: boolean;
  source: AccessDecisionSource;
  explicitOverrideApplied?: boolean;
  explicitDeny?: boolean;
  profileBaselineApplied?: boolean;
  scope?: PermissionScopeDto;
  reasons?: readonly string[];
}

export interface EffectiveWorkspaceAccessDto {
  membershipId: MembershipId;
  workspaceId: WorkspaceId;
  accessVersion: number;
  permissions: readonly PermissionDecisionDto[];
}

export interface WorkspaceQueryAccessDto {
  allowed: boolean;
  permission: PermissionKey;
  workspaceId: WorkspaceId;
  membershipId: MembershipId;
  workspaceAllowed: boolean;
  assignedTrainees: boolean;
  self: boolean;
  includeBranchIds: readonly BranchId[];
  excludeBranchIds: readonly BranchId[];
  includeRelationshipIds: readonly RelationshipId[];
  excludeRelationshipIds: readonly RelationshipId[];
  requestedBranchId?: BranchId;
  requestedRelationshipId?: RelationshipId;
  pureWorkspaceWide: boolean;
  reasons: readonly string[];
}

export interface CurrentUserEffectiveAccessDecisionRequestDto {
  permission: PermissionKey;
  scope: CurrentUserEffectiveAccessScope;
  branchId?: BranchId | null;
  relationshipId?: RelationshipId | null;
}

export interface CurrentUserEffectiveAccessDecisionsRequestDto {
  expectedAccessVersion?: number;
  requests: readonly CurrentUserEffectiveAccessDecisionRequestDto[];
}

export interface CurrentUserEffectiveAccessDecisionDto {
  request: CurrentUserEffectiveAccessDecisionRequestDto;
  allowed: boolean;
  effect: PermissionEffect;
}

export interface CurrentUserEffectiveAccessDecisionsDto {
  workspaceId: WorkspaceId;
  membershipId: MembershipId;
  accessVersion: number;
  context: CurrentUserEffectiveAccessContext;
  decisions: readonly CurrentUserEffectiveAccessDecisionDto[];
}

const permissionKeySet = new Set<string>(permissionKeys);
const currentUserEffectiveAccessScopeSet = new Set<string>(
  currentUserEffectiveAccessScopes,
);
const currentUserEffectiveAccessContextSet = new Set<string>(
  currentUserEffectiveAccessContexts,
);

export function isPermissionKey(value: string): value is PermissionKey {
  return permissionKeySet.has(value);
}

export function isCurrentUserEffectiveAccessDecisionRequestDto(
  value: unknown,
): value is CurrentUserEffectiveAccessDecisionRequestDto {
  if (!isRecord(value)) {
    return false;
  }

  const branchId = value.branchId;
  const relationshipId = value.relationshipId;
  if (
    typeof value.permission !== "string" ||
    !isPermissionKey(value.permission) ||
    typeof value.scope !== "string" ||
    !currentUserEffectiveAccessScopeSet.has(value.scope)
  ) {
    return false;
  }

  if (value.scope === "WORKSPACE") {
    return branchId === undefined && relationshipId === undefined;
  }

  if (value.scope === "BRANCH") {
    return (
      typeof branchId === "string" &&
      branchId.length > 0 &&
      relationshipId === undefined
    );
  }

  return (
    typeof relationshipId === "string" &&
    relationshipId.length > 0 &&
    branchId === undefined
  );
}

export function isCurrentUserEffectiveAccessDecisionsDto(
  value: unknown,
): value is CurrentUserEffectiveAccessDecisionsDto {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.workspaceId === "string" &&
    typeof value.membershipId === "string" &&
    typeof value.accessVersion === "number" &&
    Number.isFinite(value.accessVersion) &&
    typeof value.context === "string" &&
    currentUserEffectiveAccessContextSet.has(value.context) &&
    Array.isArray(value.decisions) &&
    value.decisions.every(isCurrentUserEffectiveAccessDecisionDto)
  );
}

function isCurrentUserEffectiveAccessDecisionDto(
  value: unknown,
): value is CurrentUserEffectiveAccessDecisionDto {
  return (
    isRecord(value) &&
    isCurrentUserEffectiveAccessDecisionRequestDto(value.request) &&
    typeof value.allowed === "boolean" &&
    (value.effect === "ALLOW" || value.effect === "DENY")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
