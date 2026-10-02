"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm, type UseFormRegisterReturn } from "react-hook-form";
import type {
  BranchDto,
  BranchId,
  CreateBranchRequestDto,
  InviteStaffRequestDto,
  MembershipBranchAssignmentDto,
  MembershipId,
  UpdateBranchRequestDto,
  UpdateWorkspaceRequestDto,
  WorkspaceMembershipRole,
} from "@/contracts";
import { workspaceMembershipRoles } from "@/contracts";
import { isApiError } from "@/lib/api";
import { useAuthSession } from "@/lib/auth";
import { useStaffWorkspaceContext } from "@/lib/staff-shell";
import {
  archiveBranch,
  assignMembershipBranch,
  createBranch,
  getWorkspaceDetail,
  inviteStaff,
  listBranches,
  listMembershipBranchAssignments,
  listMemberships,
  removeMembershipBranch,
  transitionMembership,
  updateBranch,
  updateWorkspace,
  workspaceManagementKeys,
} from "@/lib/workspace-management";
import styles from "./workspace-management.module.css";

type WorkspaceManagementLabels = {
  actions: {
    archive: string;
    assign: string;
    create: string;
    end: string;
    invite: string;
    reactivate: string;
    removeAssignment: string;
    save: string;
    suspend: string;
  };
  assignment: {
    empty: string;
    selectBranch: string;
    selectMember: string;
    title: string;
  };
  branches: {
    empty: string;
    title: string;
  };
  errors: {
    conflict: string;
    denied: string;
    malformed: string;
    unavailable: string;
    validation: string;
  };
  fields: {
    address: string;
    branch: string;
    branchCode: string;
    branchName: string;
    city: string;
    defaultLanguage: string;
    email: string;
    expiresAt: string;
    governorate: string;
    name: string;
    phone: string;
    roles: string;
    timezone: string;
  };
  invite: {
    help: string;
    title: string;
  };
  loading: string;
  noWorkspace: {
    copy: string;
    title: string;
  };
  status: {
    saved: string;
    sent: string;
  };
  staff: {
    empty: string;
    title: string;
  };
  title: string;
  workspace: {
    title: string;
  };
};

type WorkspaceFormValues = Required<UpdateWorkspaceRequestDto>;
type BranchFormValues = Required<CreateBranchRequestDto>;
type InviteFormValues = {
  branchIds: BranchId[];
  email: string;
  expiresAt: string;
  phone: string;
  roles: WorkspaceMembershipRole[];
};

const emptyWorkspaceForm: WorkspaceFormValues = {
  city: "",
  defaultLanguage: "en",
  governorate: "",
  name: "",
  timezone: "",
};

const emptyBranchForm: BranchFormValues = {
  address: "",
  city: "",
  code: "",
  governorate: "",
  name: "",
  timezone: "",
};

const emptyInviteForm: InviteFormValues = {
  branchIds: [],
  email: "",
  expiresAt: "",
  phone: "",
  roles: ["TRAINER"],
};

export function WorkspaceManagement({
  labels,
}: {
  labels: WorkspaceManagementLabels;
}) {
  const queryClient = useQueryClient();
  const { apiClient, generation, state } = useAuthSession();
  const { shellContext, workspace } = useStaffWorkspaceContext();
  const [selectedMembershipId, setSelectedMembershipId] =
    useState<MembershipId | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const workspaceId = workspace?.workspaceId ?? null;
  const accessContext = shellContext?.accessContext ?? "user";
  const canQuery = state.status === "authenticated" && workspaceId !== null;

  const workspaceQuery = useQuery({
    enabled: canQuery,
    queryFn: ({ signal }) =>
      getWorkspaceDetail(apiClient, workspaceId!, signal),
    queryKey:
      workspaceId === null
        ? ["workspace-management", "none"]
        : workspaceManagementKeys.workspace(
            workspaceId,
            generation,
            accessContext,
          ),
  });
  const branchesQuery = useQuery({
    enabled: canQuery,
    queryFn: ({ signal }) => listBranches(apiClient, workspaceId!, signal),
    queryKey:
      workspaceId === null
        ? ["workspace-management", "branches", "none"]
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
        ? ["workspace-management", "memberships", "none"]
        : workspaceManagementKeys.memberships(
            workspaceId,
            generation,
            accessContext,
          ),
  });

  const memberships = membershipsQuery.data ?? [];
  const selectedMembershipIdSafe =
    memberships.find((member) => member.id === selectedMembershipId)?.id ??
    memberships[0]?.id ??
    null;

  const assignmentsQuery = useQuery({
    enabled: canQuery && selectedMembershipIdSafe !== null,
    queryFn: ({ signal }) =>
      listMembershipBranchAssignments(
        apiClient,
        workspaceId!,
        selectedMembershipIdSafe!,
        signal,
      ),
    queryKey:
      workspaceId === null || selectedMembershipIdSafe === null
        ? ["workspace-management", "branch-assignments", "none"]
        : workspaceManagementKeys.branchAssignments(
            workspaceId,
            selectedMembershipIdSafe,
            generation,
            accessContext,
          ),
  });

  const workspaceForm = useForm<WorkspaceFormValues>({
    defaultValues: emptyWorkspaceForm,
  });
  const branchForm = useForm<BranchFormValues>({
    defaultValues: emptyBranchForm,
  });
  const inviteForm = useForm<InviteFormValues>({
    defaultValues: emptyInviteForm,
  });

  useEffect(() => {
    if (workspaceQuery.data) {
      workspaceForm.reset({
        city: workspaceQuery.data.workspace.city ?? "",
        defaultLanguage: workspaceQuery.data.workspace.defaultLanguage,
        governorate: workspaceQuery.data.workspace.governorate ?? "",
        name: workspaceQuery.data.workspace.name,
        timezone: workspaceQuery.data.workspace.timezone,
      });
    }
  }, [workspaceForm, workspaceQuery.data]);

  const invalidateWorkspace = async () => {
    if (workspaceId === null) {
      return;
    }

    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: workspaceManagementKeys.workspace(
          workspaceId,
          generation,
          accessContext,
        ),
      }),
      queryClient.invalidateQueries({
        queryKey: workspaceManagementKeys.branches(
          workspaceId,
          generation,
          accessContext,
        ),
      }),
      queryClient.invalidateQueries({
        queryKey: workspaceManagementKeys.memberships(
          workspaceId,
          generation,
          accessContext,
        ),
      }),
    ]);
  };
  const invalidateAssignments = async (membershipId: MembershipId) => {
    if (workspaceId === null) {
      return;
    }

    await queryClient.invalidateQueries({
      queryKey: workspaceManagementKeys.branchAssignments(
        workspaceId,
        membershipId,
        generation,
        accessContext,
      ),
    });
  };

  const handleError = (caught: unknown) => {
    setStatusMessage(null);
    setError(errorMessage(caught, labels));
  };
  const handleSuccess = (message: string) => {
    setError(null);
    setStatusMessage(message);
  };

  const workspaceMutation = useMutation({
    mutationFn: (body: UpdateWorkspaceRequestDto) =>
      updateWorkspace(apiClient, workspaceId!, body),
    onError: handleError,
    onSuccess: async () => {
      handleSuccess(labels.status.saved);
      await invalidateWorkspace();
    },
    retry: false,
  });
  const createBranchMutation = useMutation({
    mutationFn: (body: CreateBranchRequestDto) =>
      createBranch(apiClient, workspaceId!, body),
    onError: handleError,
    onSuccess: async () => {
      branchForm.reset(emptyBranchForm);
      handleSuccess(labels.status.saved);
      await invalidateWorkspace();
    },
    retry: false,
  });
  const archiveBranchMutation = useMutation({
    mutationFn: (branchId: BranchId) =>
      archiveBranch(apiClient, workspaceId!, branchId),
    onError: handleError,
    onSuccess: async () => {
      handleSuccess(labels.status.saved);
      await invalidateWorkspace();
    },
    retry: false,
  });
  const membershipMutation = useMutation({
    mutationFn: ({
      command,
      membershipId,
    }: {
      command: "end" | "reactivate" | "suspend";
      membershipId: MembershipId;
    }) => transitionMembership(apiClient, workspaceId!, membershipId, command),
    onError: handleError,
    onSuccess: async () => {
      handleSuccess(labels.status.saved);
      await invalidateWorkspace();
    },
    retry: false,
  });
  const inviteMutation = useMutation({
    mutationFn: (body: InviteStaffRequestDto) =>
      inviteStaff(apiClient, workspaceId!, body),
    onError: handleError,
    onSuccess: async () => {
      inviteForm.reset(emptyInviteForm);
      handleSuccess(labels.status.sent);
      await invalidateWorkspace();
    },
    retry: false,
  });
  const assignMutation = useMutation({
    mutationFn: ({
      branchId,
      membershipId,
    }: {
      branchId: BranchId;
      membershipId: MembershipId;
    }) =>
      assignMembershipBranch(apiClient, workspaceId!, membershipId, branchId),
    onError: handleError,
    onSuccess: async (_assignment, variables) => {
      handleSuccess(labels.status.saved);
      await invalidateAssignments(variables.membershipId);
    },
    retry: false,
  });
  const removeAssignmentMutation = useMutation({
    mutationFn: (assignment: MembershipBranchAssignmentDto) =>
      removeMembershipBranch(
        apiClient,
        assignment.workspaceId,
        assignment.membershipId,
        assignment.branchId,
      ),
    onError: handleError,
    onSuccess: async (_data, assignment) => {
      handleSuccess(labels.status.saved);
      await invalidateAssignments(assignment.membershipId);
    },
    retry: false,
  });

  const branches = branchesQuery.data ?? [];
  const activeAssignments = useMemo(
    () =>
      (assignmentsQuery.data ?? []).filter((assignment) => assignment.active),
    [assignmentsQuery.data],
  );

  if (workspaceId === null || shellContext === null) {
    return (
      <section className={styles.statePanel}>
        <h1>{labels.noWorkspace.title}</h1>
        <p>{labels.noWorkspace.copy}</p>
      </section>
    );
  }

  if (
    workspaceQuery.isLoading ||
    branchesQuery.isLoading ||
    membershipsQuery.isLoading
  ) {
    return (
      <section
        aria-busy="true"
        aria-live="polite"
        className={styles.statePanel}
      >
        <h1>{labels.loading}</h1>
      </section>
    );
  }

  const queryError =
    workspaceQuery.error ?? branchesQuery.error ?? membershipsQuery.error;

  if (queryError) {
    return (
      <section className={styles.statePanel} role="alert">
        <h1>{errorMessage(queryError, labels)}</h1>
      </section>
    );
  }

  const selectedWorkspace = workspace!;

  return (
    <section
      className={styles.module}
      aria-labelledby="workspace-management-title"
    >
      <header className={styles.header}>
        <div>
          <h1 id="workspace-management-title">{labels.title}</h1>
          <p>{selectedWorkspace.workspaceName}</p>
        </div>
        <div aria-live="polite" className={styles.feedback}>
          {error ? <p role="alert">{error}</p> : null}
          {statusMessage ? <p>{statusMessage}</p> : null}
        </div>
      </header>

      <section className={styles.panel} aria-labelledby="workspace-form-title">
        <h2 id="workspace-form-title">{labels.workspace.title}</h2>
        <form
          className={styles.formGrid}
          onSubmit={workspaceForm.handleSubmit((values) => {
            workspaceMutation.mutate(cleanObject(values));
          })}
        >
          <TextField
            label={labels.fields.name}
            registration={workspaceForm.register("name", { required: true })}
          />
          <TextField
            label={labels.fields.timezone}
            registration={workspaceForm.register("timezone", {
              required: true,
            })}
          />
          <label>
            <span>{labels.fields.defaultLanguage}</span>
            <select {...workspaceForm.register("defaultLanguage")}>
              <option value="en">English</option>
              <option value="ar">العربية</option>
            </select>
          </label>
          <TextField
            label={labels.fields.city}
            registration={workspaceForm.register("city")}
          />
          <TextField
            label={labels.fields.governorate}
            registration={workspaceForm.register("governorate")}
          />
          <button disabled={workspaceMutation.isPending} type="submit">
            {labels.actions.save}
          </button>
        </form>
      </section>

      <section className={styles.panel} aria-labelledby="branches-title">
        <h2 id="branches-title">{labels.branches.title}</h2>
        {branches.length === 0 ? <p>{labels.branches.empty}</p> : null}
        <div className={styles.list}>
          {branches.map((branch) => (
            <BranchRow
              branch={branch}
              key={branch.id}
              labels={labels}
              onArchive={() => archiveBranchMutation.mutate(branch.id)}
              onSave={(body) =>
                updateBranch(apiClient, workspaceId, branch.id, body)
                  .then(invalidateWorkspace)
                  .then(() => handleSuccess(labels.status.saved))
                  .catch(handleError)
              }
              pending={archiveBranchMutation.isPending}
            />
          ))}
        </div>
        <form
          className={styles.formGrid}
          onSubmit={branchForm.handleSubmit((values) => {
            createBranchMutation.mutate(cleanObject(values));
          })}
        >
          <TextField
            label={labels.fields.branchName}
            registration={branchForm.register("name", { required: true })}
          />
          <TextField
            label={labels.fields.branchCode}
            registration={branchForm.register("code")}
          />
          <TextField
            label={labels.fields.timezone}
            registration={branchForm.register("timezone")}
          />
          <TextField
            label={labels.fields.address}
            registration={branchForm.register("address")}
          />
          <TextField
            label={labels.fields.city}
            registration={branchForm.register("city")}
          />
          <TextField
            label={labels.fields.governorate}
            registration={branchForm.register("governorate")}
          />
          <button disabled={createBranchMutation.isPending} type="submit">
            {labels.actions.create}
          </button>
        </form>
      </section>

      <section className={styles.panel} aria-labelledby="staff-title">
        <h2 id="staff-title">{labels.staff.title}</h2>
        {memberships.length === 0 ? <p>{labels.staff.empty}</p> : null}
        <div className={styles.list}>
          {memberships.map((member) => (
            <article className={styles.item} key={member.id}>
              <div>
                <h3>{member.id}</h3>
                <p>
                  {member.roles.join(", ")} · {member.status}
                </p>
              </div>
              <div className={styles.actions}>
                <button
                  disabled={membershipMutation.isPending}
                  onClick={() =>
                    membershipMutation.mutate({
                      command: "suspend",
                      membershipId: member.id,
                    })
                  }
                  type="button"
                >
                  {labels.actions.suspend}
                </button>
                <button
                  disabled={membershipMutation.isPending}
                  onClick={() =>
                    membershipMutation.mutate({
                      command: "reactivate",
                      membershipId: member.id,
                    })
                  }
                  type="button"
                >
                  {labels.actions.reactivate}
                </button>
                <button
                  disabled={membershipMutation.isPending}
                  onClick={() =>
                    membershipMutation.mutate({
                      command: "end",
                      membershipId: member.id,
                    })
                  }
                  type="button"
                >
                  {labels.actions.end}
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.panel} aria-labelledby="invite-title">
        <h2 id="invite-title">{labels.invite.title}</h2>
        <p>{labels.invite.help}</p>
        <form
          className={styles.formGrid}
          onSubmit={inviteForm.handleSubmit((values) => {
            inviteMutation.mutate({
              ...cleanObject({
                email: values.email,
                expiresAt: values.expiresAt,
                phone: values.phone,
              }),
              branchIds: values.branchIds,
              roles: values.roles,
            });
          })}
        >
          <TextField
            label={labels.fields.email}
            registration={inviteForm.register("email")}
            type="email"
          />
          <TextField
            label={labels.fields.phone}
            registration={inviteForm.register("phone")}
            type="tel"
          />
          <TextField
            label={labels.fields.expiresAt}
            registration={inviteForm.register("expiresAt")}
            type="datetime-local"
          />
          <fieldset>
            <legend>{labels.fields.roles}</legend>
            {workspaceMembershipRoles
              .filter((role) => role !== "TRAINEE")
              .map((role) => (
                <label className={styles.checkLabel} key={role}>
                  <input
                    type="checkbox"
                    value={role}
                    {...inviteForm.register("roles", { required: true })}
                  />
                  <span>{role}</span>
                </label>
              ))}
          </fieldset>
          <fieldset>
            <legend>{labels.fields.branch}</legend>
            {branches.map((branch) => (
              <label className={styles.checkLabel} key={branch.id}>
                <input
                  type="checkbox"
                  value={branch.id}
                  {...inviteForm.register("branchIds")}
                />
                <span>{branch.name}</span>
              </label>
            ))}
          </fieldset>
          <button disabled={inviteMutation.isPending} type="submit">
            {labels.actions.invite}
          </button>
        </form>
      </section>

      <section className={styles.panel} aria-labelledby="assignment-title">
        <h2 id="assignment-title">{labels.assignment.title}</h2>
        {memberships.length === 0 || branches.length === 0 ? (
          <p>{labels.assignment.empty}</p>
        ) : (
          <>
            <div className={styles.formGrid}>
              <label>
                <span>{labels.assignment.selectMember}</span>
                <select
                  onChange={(event) =>
                    setSelectedMembershipId(event.target.value as MembershipId)
                  }
                  value={selectedMembershipIdSafe ?? ""}
                >
                  {memberships.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.id}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>{labels.assignment.selectBranch}</span>
                <select
                  onChange={(event) => {
                    if (selectedMembershipIdSafe) {
                      assignMutation.mutate({
                        branchId: event.target.value as BranchId,
                        membershipId: selectedMembershipIdSafe,
                      });
                    }
                  }}
                  value=""
                >
                  <option value="">{labels.actions.assign}</option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className={styles.list}>
              {activeAssignments.map((assignment) => (
                <article className={styles.item} key={assignment.id}>
                  <p>{branchName(branches, assignment.branchId)}</p>
                  <button
                    disabled={removeAssignmentMutation.isPending}
                    onClick={() => removeAssignmentMutation.mutate(assignment)}
                    type="button"
                  >
                    {labels.actions.removeAssignment}
                  </button>
                </article>
              ))}
            </div>
          </>
        )}
      </section>
    </section>
  );
}

function BranchRow({
  branch,
  labels,
  onArchive,
  onSave,
  pending,
}: {
  branch: BranchDto;
  labels: WorkspaceManagementLabels;
  onArchive: () => void;
  onSave: (body: UpdateBranchRequestDto) => void;
  pending: boolean;
}) {
  const form = useForm<BranchFormValues>({
    defaultValues: {
      address: branch.address ?? "",
      city: branch.city ?? "",
      code: branch.code ?? "",
      governorate: branch.governorate ?? "",
      name: branch.name,
      timezone: branch.timezone,
    },
  });

  return (
    <article className={styles.item}>
      <form
        className={styles.inlineForm}
        onSubmit={form.handleSubmit((values) => onSave(cleanObject(values)))}
      >
        <TextField
          label={labels.fields.branchName}
          registration={form.register("name", { required: true })}
        />
        <TextField
          label={labels.fields.timezone}
          registration={form.register("timezone")}
        />
        <span>{branch.status}</span>
        <button type="submit">{labels.actions.save}</button>
        <button disabled={pending} onClick={onArchive} type="button">
          {labels.actions.archive}
        </button>
      </form>
    </article>
  );
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

function cleanObject<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => {
      if (Array.isArray(entry)) {
        return entry.length > 0;
      }

      return entry !== "";
    }),
  ) as T;
}

function branchName(
  branches: readonly BranchDto[],
  branchId: BranchId,
): string {
  return branches.find((branch) => branch.id === branchId)?.name ?? branchId;
}

function errorMessage(
  error: unknown,
  labels: WorkspaceManagementLabels,
): string {
  if (!isApiError(error)) {
    return labels.errors.unavailable;
  }

  if (error.category === "forbidden") {
    return labels.errors.denied;
  }

  if (error.category === "expected-version-conflict") {
    return labels.errors.conflict;
  }

  if (error.category === "validation") {
    return labels.errors.validation;
  }

  if (error.kind === "malformed-response") {
    return labels.errors.malformed;
  }

  return labels.errors.unavailable;
}
