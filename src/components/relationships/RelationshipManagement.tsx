"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm, type UseFormRegisterReturn } from "react-hook-form";
import type {
  BranchId,
  CoachingRelationshipDto,
  MembershipId,
  PermissionDecisionDto,
  RelationshipId,
  RelationshipStatus,
  WorkspaceId,
} from "@/contracts";
import { relationshipStatuses } from "@/contracts";
import { ApiError, createIdempotencyKey, isApiError } from "@/lib/api";
import {
  AccessControlledButton,
  evaluateAccess,
  type AccessDecision,
} from "@/lib/access";
import { useAuthSession } from "@/lib/auth";
import {
  listBranches,
  listMemberships,
  workspaceManagementKeys,
} from "@/lib/workspace-management";
import { useStaffWorkspaceContext } from "@/lib/staff-shell";
import {
  addRelationshipStaffAssignment,
  changeRelationshipHomeBranch,
  getRelationship,
  listRelationships,
  relationshipKeys,
  relationshipStatusFilter,
  removePrimaryTrainer,
  removeRelationshipStaffAssignment,
  setPrimaryTrainer,
} from "@/lib/relationships";
import styles from "./relationships.module.css";

type RelationshipLabels = {
  actions: {
    addAssistant: string;
    addNutritionist: string;
    changeBranch: string;
    removeAssistant: string;
    removeNutritionist: string;
    removePrimary: string;
    setPrimary: string;
  };
  assignments: {
    helper: string;
    title: string;
  };
  confirm: {
    removeAssistant: string;
    removeNutritionist: string;
    removePrimary: string;
  };
  detail: {
    currentPrimary: string;
    engagement: string;
    homeBranch: string;
    proposedPrimary: string;
    relationshipId: string;
    title: string;
    traineeMembershipId: string;
    traineeUserId: string;
    version: string;
  };
  empty: string;
  errors: {
    accessUnavailable: string;
    conflict: string;
    denied: string;
    malformed: string;
    unavailable: string;
    validation: string;
  };
  fields: {
    branch: string;
    expectedVersion: string;
    reason: string;
    staffMember: string;
    status: string;
  };
  loading: string;
  noWorkspace: {
    copy: string;
    title: string;
  };
  relationshipIdWarning: string;
  status: {
    saved: string;
  };
  title: string;
};

type RelationshipFormValues = {
  branchId: string;
  expectedVersion: string;
  reason: string;
  staffMembershipId: string;
};

type RelationshipCommandAction =
  | "add-assistant"
  | "add-nutritionist"
  | "branch"
  | "remove-assistant"
  | "remove-nutritionist"
  | "remove-primary"
  | "set-primary";

const commandLocksByOwner = new Map<string, Set<string>>();
const commandIdempotencyByOwner = new Map<
  string,
  { fingerprint: string; key: string }
>();

const emptyRelationshipForm: RelationshipFormValues = {
  branchId: "",
  expectedVersion: "",
  reason: "",
  staffMembershipId: "",
};

export function RelationshipManagement({
  labels,
}: {
  labels: RelationshipLabels;
}) {
  const queryClient = useQueryClient();
  const { apiClient, generation, state } = useAuthSession();
  const { accessFacts, shellContext, workspace } = useStaffWorkspaceContext();
  const commandOwner = useId();
  const [selectedId, setSelectedId] = useState<RelationshipId | null>(null);
  const [statusFilter, setStatusFilter] = useState<RelationshipStatus | "ALL">(
    "ALL",
  );
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<RelationshipFormValues>({
    defaultValues: emptyRelationshipForm,
  });

  const selectedWorkspace = workspace;
  const workspaceId = selectedWorkspace?.workspaceId ?? null;
  const accessContext = shellContext?.accessContext ?? "user";
  const canQuery = state.status === "authenticated" && workspaceId !== null;

  useEffect(() => {
    return () => {
      commandLocksByOwner.delete(commandOwner);
      commandIdempotencyByOwner.delete(commandOwner);
    };
  }, [commandOwner]);

  const relationshipsQuery = useQuery({
    enabled: canQuery,
    queryFn: ({ signal }) =>
      listRelationships(
        apiClient,
        workspaceId!,
        { status: relationshipStatusFilter(statusFilter) },
        signal,
      ),
    queryKey:
      workspaceId === null
        ? ["relationships", "none"]
        : relationshipKeys.list(
            workspaceId,
            generation,
            statusFilter,
            accessContext,
          ),
  });

  const relationships = relationshipsQuery.data ?? [];
  const selectedRelationshipId =
    relationships.find((relationship) => relationship.id === selectedId)?.id ??
    relationships[0]?.id ??
    null;

  const detailQuery = useQuery({
    enabled: canQuery && selectedRelationshipId !== null,
    queryFn: ({ signal }) =>
      getRelationship(apiClient, workspaceId!, selectedRelationshipId!, signal),
    queryKey:
      workspaceId === null || selectedRelationshipId === null
        ? ["relationships", "detail", "none"]
        : relationshipKeys.detail(
            workspaceId,
            selectedRelationshipId,
            generation,
            accessContext,
          ),
  });

  const branchesQuery = useQuery({
    enabled: canQuery,
    queryFn: ({ signal }) => listBranches(apiClient, workspaceId!, signal),
    queryKey:
      workspaceId === null
        ? ["relationships", "branches", "none"]
        : workspaceManagementKeys.branches(
            workspaceId,
            generation,
            accessContext,
          ),
  });

  const membershipsQuery = useQuery({
    enabled: canQuery,
    queryFn: ({ signal }) => listMemberships(apiClient, workspaceId!, signal),
    queryKey:
      workspaceId === null
        ? ["relationships", "memberships", "none"]
        : workspaceManagementKeys.memberships(
            workspaceId,
            generation,
            accessContext,
          ),
  });

  const relationship = detailQuery.data ?? null;
  useEffect(() => {
    if (relationship) {
      form.reset({
        ...emptyRelationshipForm,
        branchId: relationship.homeBranchId ?? "",
        expectedVersion: relationship.version.toString(),
      });
    }
  }, [form, relationship]);

  const permissions = {
    assistant: actionDecision({
      accessContext,
      accessFacts,
      generation,
      permission: "trainees.assignments.assistant.manage",
      relationshipId: selectedRelationshipId,
      workspaceId,
    }),
    homeBranch: actionDecision({
      accessContext,
      accessFacts,
      generation,
      permission: "trainees.update",
      relationshipId: selectedRelationshipId,
      workspaceId,
    }),
    nutritionist: actionDecision({
      accessContext,
      accessFacts,
      generation,
      permission: "trainees.assignments.nutritionist.manage",
      relationshipId: selectedRelationshipId,
      workspaceId,
    }),
    primary: actionDecision({
      accessContext,
      accessFacts,
      generation,
      permission: "trainees.assignments.primary.manage",
      relationshipId: selectedRelationshipId,
      workspaceId,
    }),
  };

  const invalidateRelationships = async (id: RelationshipId | null) => {
    if (workspaceId === null) {
      return;
    }

    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: relationshipKeys.list(
          workspaceId,
          generation,
          statusFilter,
          accessContext,
        ),
      }),
      id === null
        ? Promise.resolve()
        : queryClient.invalidateQueries({
            queryKey: relationshipKeys.detail(
              workspaceId,
              id,
              generation,
              accessContext,
            ),
          }),
    ]);
  };

  const commandMutation = useMutation({
    mutationFn: async (input: {
      action: RelationshipCommandAction;
      relationshipId: RelationshipId;
      values: RelationshipFormValues;
    }) => {
      const body = commandBody(input.values);
      if (body === null || workspaceId === null) {
        throw validationError();
      }
      const idempotencyKey = idempotencyKeyForCommand(commandOwner, input);
      if (input.action === "branch") {
        if (!input.values.branchId) throw validationError();
        return await changeRelationshipHomeBranch(
          apiClient,
          workspaceId,
          input.relationshipId,
          {
            expectedVersion: body.expectedVersion,
            homeBranchId: input.values.branchId as BranchId,
            ...(input.values.staffMembershipId
              ? {
                  primaryTrainerMembershipId: input.values
                    .staffMembershipId as MembershipId,
                }
              : {}),
          },
          idempotencyKey,
        );
      }
      if (input.action === "set-primary") {
        if (!input.values.staffMembershipId) throw validationError();
        return await setPrimaryTrainer(
          apiClient,
          workspaceId,
          input.relationshipId,
          {
            expectedVersion: body.expectedVersion,
            primaryTrainerMembershipId: input.values
              .staffMembershipId as MembershipId,
            ...reason(input.values.reason),
          },
          idempotencyKey,
        );
      }
      if (input.action === "remove-primary") {
        return await removePrimaryTrainer(
          apiClient,
          workspaceId,
          input.relationshipId,
          body,
          idempotencyKey,
        );
      }
      if (
        input.action === "add-assistant" ||
        input.action === "add-nutritionist"
      ) {
        if (!input.values.staffMembershipId) throw validationError();
        return await addRelationshipStaffAssignment(
          apiClient,
          workspaceId,
          input.relationshipId,
          input.action === "add-assistant" ? "assistants" : "nutritionists",
          {
            expectedVersion: body.expectedVersion,
            staffMembershipId: input.values.staffMembershipId as MembershipId,
            ...reason(input.values.reason),
          },
          idempotencyKey,
        );
      }
      if (!input.values.staffMembershipId) throw validationError();
      return await removeRelationshipStaffAssignment(
        apiClient,
        workspaceId,
        input.relationshipId,
        input.action === "remove-assistant" ? "assistants" : "nutritionists",
        input.values.staffMembershipId as MembershipId,
        body,
        idempotencyKey,
      );
    },
    onError: (caught) => {
      setStatusMessage(null);
      setError(errorMessage(caught, labels));
    },
    onSuccess: async (_data, variables) => {
      commandIdempotencyByOwner.delete(commandOwner);
      setError(null);
      setStatusMessage(labels.status.saved);
      await invalidateRelationships(variables.relationshipId);
    },
    retry: false,
  });

  const submitCommand = (
    action: RelationshipCommandAction,
    decision: AccessDecision,
  ) => {
    if (!decision.allowed || selectedRelationshipId === null) {
      return;
    }
    if (!confirmRelationshipCommand(action, labels)) {
      return;
    }
    const values = form.getValues();
    void runOnce(commandOwner, "relationship:command", () =>
      commandMutation.mutateAsync({
        action,
        relationshipId: selectedRelationshipId,
        values,
      }),
    );
  };

  if (
    workspaceId === null ||
    shellContext === null ||
    selectedWorkspace === null
  ) {
    return (
      <section className={styles.statePanel}>
        <h1>{labels.noWorkspace.title}</h1>
        <p>{labels.noWorkspace.copy}</p>
      </section>
    );
  }

  if (
    relationshipsQuery.isLoading ||
    detailQuery.isLoading ||
    branchesQuery.isLoading ||
    membershipsQuery.isLoading
  ) {
    return (
      <section aria-busy="true" className={styles.statePanel}>
        <h1>{labels.loading}</h1>
      </section>
    );
  }

  const queryError =
    relationshipsQuery.error ??
    detailQuery.error ??
    branchesQuery.error ??
    membershipsQuery.error;
  if (queryError) {
    return (
      <section className={styles.statePanel} role="alert">
        <h1>{errorMessage(queryError, labels)}</h1>
      </section>
    );
  }

  return (
    <section className={styles.module} aria-labelledby="relationships-title">
      <header className={styles.header}>
        <div>
          <h1 id="relationships-title">{labels.title}</h1>
          <p>{selectedWorkspace.workspaceName}</p>
        </div>
        <div aria-live="polite" className={styles.feedback}>
          {error ? <p role="alert">{error}</p> : null}
          {statusMessage ? <p>{statusMessage}</p> : null}
        </div>
      </header>

      <label className={styles.filter}>
        <span>{labels.fields.status}</span>
        <select
          value={statusFilter}
          onChange={(event) =>
            setStatusFilter(
              event.currentTarget.value as RelationshipStatus | "ALL",
            )
          }
        >
          <option value="ALL">ALL</option>
          {relationshipStatuses.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </label>

      <div className={styles.grid}>
        <section className={styles.panel}>
          {relationships.length === 0 ? <p>{labels.empty}</p> : null}
          <div className={styles.list}>
            {relationships.map((item) => (
              <button
                aria-current={
                  item.id === selectedRelationshipId ? "true" : undefined
                }
                className={styles.relationshipButton}
                key={item.id}
                onClick={() => setSelectedId(item.id)}
                type="button"
              >
                <strong>{item.status}</strong>
                <span>{item.id}</span>
              </button>
            ))}
          </div>
        </section>

        <section
          className={styles.panel}
          aria-labelledby="relationship-detail-title"
        >
          <h2 id="relationship-detail-title">{labels.detail.title}</h2>
          {relationship ? (
            <>
              <RelationshipDetail labels={labels} relationship={relationship} />
              <form
                className={styles.formGrid}
                onSubmit={(event) => event.preventDefault()}
              >
                <SelectField
                  label={labels.fields.branch}
                  registration={form.register("branchId")}
                >
                  <option value="">-</option>
                  {(branchesQuery.data ?? []).map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </SelectField>
                <SelectField
                  label={labels.fields.staffMember}
                  registration={form.register("staffMembershipId")}
                >
                  <option value="">-</option>
                  {(membershipsQuery.data ?? []).map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.id}
                    </option>
                  ))}
                </SelectField>
                <TextField
                  label={labels.fields.expectedVersion}
                  registration={form.register("expectedVersion", {
                    required: true,
                  })}
                  type="number"
                />
                <TextField
                  label={labels.fields.reason}
                  registration={form.register("reason")}
                />
              </form>
              <div className={styles.actions}>
                <AccessControlledButton
                  decision={permissions.homeBranch}
                  disabled={commandMutation.isPending}
                  disabledReason={disabledReason(
                    permissions.homeBranch,
                    labels,
                  )}
                  loadingLabel={labels.errors.accessUnavailable}
                  type="button"
                  onClick={() =>
                    submitCommand("branch", permissions.homeBranch)
                  }
                >
                  {labels.actions.changeBranch}
                </AccessControlledButton>
                <AccessControlledButton
                  decision={permissions.primary}
                  disabled={commandMutation.isPending}
                  disabledReason={disabledReason(permissions.primary, labels)}
                  loadingLabel={labels.errors.accessUnavailable}
                  type="button"
                  onClick={() =>
                    submitCommand("set-primary", permissions.primary)
                  }
                >
                  {labels.actions.setPrimary}
                </AccessControlledButton>
                <AccessControlledButton
                  decision={permissions.primary}
                  disabled={
                    commandMutation.isPending ||
                    !relationship.currentPrimaryTrainerAssignmentId
                  }
                  disabledReason={disabledReason(permissions.primary, labels)}
                  loadingLabel={labels.errors.accessUnavailable}
                  type="button"
                  onClick={() =>
                    submitCommand("remove-primary", permissions.primary)
                  }
                >
                  {labels.actions.removePrimary}
                </AccessControlledButton>
                <AccessControlledButton
                  decision={permissions.assistant}
                  disabled={commandMutation.isPending}
                  disabledReason={disabledReason(permissions.assistant, labels)}
                  loadingLabel={labels.errors.accessUnavailable}
                  type="button"
                  onClick={() =>
                    submitCommand("add-assistant", permissions.assistant)
                  }
                >
                  {labels.actions.addAssistant}
                </AccessControlledButton>
                <AccessControlledButton
                  decision={permissions.assistant}
                  disabled={commandMutation.isPending}
                  disabledReason={disabledReason(permissions.assistant, labels)}
                  loadingLabel={labels.errors.accessUnavailable}
                  type="button"
                  onClick={() =>
                    submitCommand("remove-assistant", permissions.assistant)
                  }
                >
                  {labels.actions.removeAssistant}
                </AccessControlledButton>
                <AccessControlledButton
                  decision={permissions.nutritionist}
                  disabled={commandMutation.isPending}
                  disabledReason={disabledReason(
                    permissions.nutritionist,
                    labels,
                  )}
                  loadingLabel={labels.errors.accessUnavailable}
                  type="button"
                  onClick={() =>
                    submitCommand("add-nutritionist", permissions.nutritionist)
                  }
                >
                  {labels.actions.addNutritionist}
                </AccessControlledButton>
                <AccessControlledButton
                  decision={permissions.nutritionist}
                  disabled={commandMutation.isPending}
                  disabledReason={disabledReason(
                    permissions.nutritionist,
                    labels,
                  )}
                  loadingLabel={labels.errors.accessUnavailable}
                  type="button"
                  onClick={() =>
                    submitCommand(
                      "remove-nutritionist",
                      permissions.nutritionist,
                    )
                  }
                >
                  {labels.actions.removeNutritionist}
                </AccessControlledButton>
              </div>
              <p className={styles.helper}>{labels.assignments.helper}</p>
            </>
          ) : (
            <p>{labels.empty}</p>
          )}
        </section>
      </div>
    </section>
  );
}

function RelationshipDetail({
  labels,
  relationship,
}: {
  labels: RelationshipLabels;
  relationship: CoachingRelationshipDto;
}) {
  const relationshipIdWarning =
    String(relationship.id) === String(relationship.traineeUserId)
      ? labels.relationshipIdWarning
      : null;

  return (
    <dl className={styles.details}>
      <dt>{labels.detail.relationshipId}</dt>
      <dd>{relationship.id}</dd>
      <dt>{labels.detail.traineeUserId}</dt>
      <dd>{relationship.traineeUserId}</dd>
      <dt>{labels.detail.traineeMembershipId}</dt>
      <dd>{relationship.traineeMembershipId ?? "-"}</dd>
      <dt>{labels.detail.homeBranch}</dt>
      <dd>{relationship.homeBranchId ?? "-"}</dd>
      <dt>{labels.detail.proposedPrimary}</dt>
      <dd>{relationship.proposedPrimaryTrainerMembershipId ?? "-"}</dd>
      <dt>{labels.detail.currentPrimary}</dt>
      <dd>{relationship.currentPrimaryTrainerAssignmentId ?? "-"}</dd>
      <dt>{labels.detail.version}</dt>
      <dd>{relationship.version}</dd>
      <dt>{labels.detail.engagement}</dt>
      <dd>{relationship.engagementPeriods.length}</dd>
      {relationshipIdWarning ? (
        <>
          <dt>{labels.errors.malformed}</dt>
          <dd>{relationshipIdWarning}</dd>
        </>
      ) : null}
    </dl>
  );
}

function actionDecision({
  accessContext,
  accessFacts,
  generation,
  permission,
  relationshipId,
  workspaceId,
}: {
  accessContext: "support" | "user";
  accessFacts: ReturnType<typeof useStaffWorkspaceContext>["accessFacts"];
  generation: number;
  permission: PermissionDecisionDto["permission"];
  relationshipId: RelationshipId | null;
  workspaceId: WorkspaceId | null;
}): AccessDecision {
  return evaluateAccess(accessFacts, {
    accessContext,
    context: "WORKSPACE",
    permission,
    scope: relationshipId === null ? "workspace" : "relationship",
    sessionGeneration: generation,
    workspaceId: workspaceId ?? undefined,
    ...(relationshipId === null ? {} : { relationshipId }),
  });
}

function TextField({
  label,
  registration,
  type = "text",
}: {
  label: string;
  registration: UseFormRegisterReturn;
  type?: string;
}) {
  return (
    <label>
      <span>{label}</span>
      <input type={type} {...registration} />
    </label>
  );
}

function SelectField({
  children,
  label,
  registration,
}: {
  children: ReactNode;
  label: string;
  registration: UseFormRegisterReturn;
}) {
  return (
    <label>
      <span>{label}</span>
      <select {...registration}>{children}</select>
    </label>
  );
}

function commandBody(
  values: RelationshipFormValues,
): { expectedVersion: number; reason?: string } | null {
  const expectedVersion = Number(values.expectedVersion);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 0) {
    return null;
  }

  return {
    expectedVersion,
    ...reason(values.reason),
  };
}

function reason(value: string): { reason?: string } {
  const trimmed = value.trim();
  return trimmed ? { reason: trimmed } : {};
}

async function runOnce(
  owner: string,
  key: string,
  action: () => Promise<unknown>,
): Promise<void> {
  const locks = commandLocksByOwner.get(owner) ?? new Set<string>();
  commandLocksByOwner.set(owner, locks);
  if (locks.has(key)) return;
  locks.add(key);
  try {
    await action();
  } catch {
    // React Query mutation callbacks publish user-facing errors.
  } finally {
    locks.delete(key);
  }
}

function idempotencyKeyForCommand(owner: string, input: unknown): string {
  const fingerprint = JSON.stringify(input);
  const existing = commandIdempotencyByOwner.get(owner);
  if (existing?.fingerprint === fingerprint) {
    return existing.key;
  }

  const key = createIdempotencyKey();
  commandIdempotencyByOwner.set(owner, { fingerprint, key });
  return key;
}

function confirmRelationshipCommand(
  action: RelationshipCommandAction,
  labels: RelationshipLabels,
): boolean {
  const message =
    action === "remove-primary"
      ? labels.confirm.removePrimary
      : action === "remove-assistant"
        ? labels.confirm.removeAssistant
        : action === "remove-nutritionist"
          ? labels.confirm.removeNutritionist
          : null;

  return message === null || globalThis.confirm(message);
}

function disabledReason(decision: AccessDecision, labels: RelationshipLabels) {
  if (decision.status === "denied") return labels.errors.denied;
  if (decision.status === "unavailable") return labels.errors.unavailable;
  if (decision.status === "unresolved") return labels.errors.accessUnavailable;
  return labels.errors.accessUnavailable;
}

function errorMessage(error: unknown, labels: RelationshipLabels): string {
  if (!isApiError(error)) {
    return labels.errors.unavailable;
  }

  if (error.kind === "malformed-response") return labels.errors.malformed;
  if (error.category === "forbidden") return labels.errors.denied;
  if (
    error.category === "expected-version-conflict" ||
    error.category === "idempotency-conflict"
  ) {
    return labels.errors.conflict;
  }
  if (error.category === "validation") return labels.errors.validation;
  return labels.errors.unavailable;
}

function validationError(): ApiError {
  return new ApiError({
    category: "validation",
    kind: "backend",
    message: "Relationship form invalid.",
    status: 422,
  });
}
