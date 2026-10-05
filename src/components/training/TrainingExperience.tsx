"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import type {
  MembershipId,
  PermissionDecisionDto,
  ProgramId,
  RelationshipId,
  TrainingProgramDto,
  WorkoutId,
  WorkspaceId,
} from "@/contracts";
import { ApiError, createIdempotencyKey, isApiError } from "@/lib/api";
import {
  AccessControlledButton,
  evaluateAccess,
  type AccessDecision,
} from "@/lib/access";
import { useAuthSession } from "@/lib/auth";
import { listRelationships, relationshipKeys } from "@/lib/relationships";
import type { AuthorizationCacheContext } from "@/lib/server-state";
import { useStaffWorkspaceContext } from "@/lib/staff-shell";
import {
  abandonWorkout,
  activateTrainingProgram,
  completeWorkout,
  deferProgramDay,
  getCurrentWorkout,
  getTrainingProgram,
  getTrainingProgramProgress,
  listPersonalRecordEvents,
  listPersonalRecords,
  listTrainingPrograms,
  listWorkouts,
  skipProgramDay,
  startWorkout,
  trainingKeys,
} from "@/lib/training";
import styles from "./training.module.css";
import {
  ProgramEditor,
  WorkoutEditor,
  type TrainingEditorLabels,
} from "./TrainingEditors";

type TrainingLabels = {
  editor: TrainingEditorLabels;
  values: Record<string, string>;
  actions: {
    abandonWorkout: string;
    activateProgram: string;
    completeWorkout: string;
    deferDay: string;
    skipDay: string;
    startWorkout: string;
  };
  capped: string;
  confirm: {
    abandonWorkout: string;
    activateProgram: string;
    completeWorkout: string;
    deferDay: string;
    skipDay: string;
    startWorkout: string;
  };
  detail: {
    currentDay: string;
    dayCount: string;
    progress: string;
    status: string;
    version: string;
  };
  empty: {
    programs: string;
    records: string;
    relationships: string;
    workouts: string;
  };
  errors: {
    accessUnavailable: string;
    conflict: string;
    denied: string;
    malformed: string;
    rateLimited: string;
    unavailable: string;
    validation: string;
  };
  fields: {
    expectedVersion: string;
    reason: string;
  };
  loading: string;
  noWorkspace: {
    copy: string;
    title: string;
  };
  panels: {
    currentWorkout: string;
    personalRecords: string;
    programs: string;
    relationships: string;
    workoutHistory: string;
  };
  status: {
    saved: string;
  };
  title: string;
};

type CommandAction =
  | "abandon-workout"
  | "activate-program"
  | "complete-workout"
  | "defer-day"
  | "skip-day"
  | "start-workout";

type CommandValues = {
  expectedVersion: string;
  reason: string;
};

const commandLocksByOwner = new Map<string, Set<string>>();
const commandIdempotencyByOwner = new Map<string, Map<string, string>>();

export function TrainingExperience({ labels }: { labels: TrainingLabels }) {
  const { generation } = useAuthSession();
  const { shellContext, workspace } = useStaffWorkspaceContext();
  return (
    <TrainingContent
      key={JSON.stringify([
        generation,
        workspace?.workspaceId,
        shellContext?.accessContext,
      ])}
      labels={labels}
    />
  );
}

function TrainingContent({ labels }: { labels: TrainingLabels }) {
  const queryClient = useQueryClient();
  const { apiClient, generation, state } = useAuthSession();
  const { accessFacts, shellContext, workspace } = useStaffWorkspaceContext();
  const commandOwner = useId();
  const [selectedRelationshipId, setSelectedRelationshipId] =
    useState<RelationshipId | null>(null);
  const [selectedProgramId, setSelectedProgramId] = useState<ProgramId | null>(
    null,
  );
  const [selectedWorkoutId, setSelectedWorkoutId] = useState<WorkoutId | null>(
    null,
  );
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedbackContext, setFeedbackContext] = useState<string | null>(null);
  const form = useForm<CommandValues>({
    defaultValues: { expectedVersion: "", reason: "" },
  });

  const workspaceId = workspace?.workspaceId ?? null;
  const selectedWorkspace = workspace;
  const membershipId = selectedWorkspace?.membershipId;
  const accessContext = shellContext?.accessContext ?? "user";
  const canQuery = state.status === "authenticated" && workspaceId !== null;
  const readDecisions = {
    relationships: actionDecision({
      accessContext,
      accessFacts,
      generation,
      membershipId,
      permission: "trainees.read",
      workspaceId,
    }),
    programs: actionDecision({
      accessContext,
      accessFacts,
      generation,
      membershipId,
      permission: "programs.read",
      workspaceId,
    }),
    workouts: actionDecision({
      accessContext,
      accessFacts,
      generation,
      membershipId,
      permission: "workouts.read",
      workspaceId,
    }),
    records: actionDecision({
      accessContext,
      accessFacts,
      generation,
      membershipId,
      permission: "personal_records.read",
      workspaceId,
    }),
  };
  const currentContextRef = useRef({
    accessContext,
    generation,
    selectedProgramId,
    selectedRelationshipId,
    workspaceId,
  });

  useEffect(() => {
    return () => {
      commandLocksByOwner.delete(commandOwner);
      commandIdempotencyByOwner.delete(commandOwner);
    };
  }, [commandOwner]);

  const relationshipsQuery = useQuery({
    enabled: canQuery && readDecisions.relationships.allowed,
    queryFn: ({ signal }) =>
      listRelationships(apiClient, workspaceId!, {}, signal),
    queryKey:
      workspaceId === null
        ? ["training", "relationships", "none"]
        : relationshipKeys.list(workspaceId, generation, "ALL", accessContext),
  });
  const relationships = readDecisions.relationships.allowed
    ? (relationshipsQuery.data ?? [])
    : [];
  const relationshipId =
    relationships.find(
      (relationship) => relationship.id === selectedRelationshipId,
    )?.id ??
    relationships[0]?.id ??
    null;

  const programsQuery = useQuery({
    enabled:
      canQuery && relationshipId !== null && readDecisions.programs.allowed,
    queryFn: ({ signal }) =>
      listTrainingPrograms(apiClient, workspaceId!, relationshipId!, signal),
    queryKey:
      workspaceId === null || relationshipId === null
        ? ["training", "programs", "none"]
        : trainingKeys.programs(
            workspaceId,
            relationshipId,
            generation,
            accessContext,
          ),
  });
  const programs = readDecisions.programs.allowed
    ? (programsQuery.data ?? [])
    : [];
  const programId =
    programs.find((program) => program.id === selectedProgramId)?.id ??
    programs[0]?.id ??
    null;

  useEffect(() => {
    currentContextRef.current = {
      accessContext,
      generation,
      selectedProgramId: programId,
      selectedRelationshipId: relationshipId,
      workspaceId,
    };
  }, [accessContext, generation, programId, relationshipId, workspaceId]);

  const programQuery = useQuery({
    enabled:
      canQuery &&
      relationshipId !== null &&
      programId !== null &&
      readDecisions.programs.allowed,
    queryFn: ({ signal }) =>
      getTrainingProgram(
        apiClient,
        workspaceId!,
        relationshipId!,
        programId!,
        signal,
      ),
    queryKey:
      workspaceId === null || relationshipId === null || programId === null
        ? ["training", "program", "none"]
        : trainingKeys.program(
            workspaceId,
            relationshipId,
            programId,
            generation,
            accessContext,
          ),
  });
  const progressQuery = useQuery({
    enabled:
      canQuery &&
      readDecisions.programs.allowed &&
      relationshipId !== null &&
      programs.some(
        (program) => program.id === programId && program.status === "ACTIVE",
      ),
    queryFn: ({ signal }) =>
      getTrainingProgramProgress(
        apiClient,
        workspaceId!,
        relationshipId!,
        programId!,
        signal,
      ),
    queryKey:
      workspaceId === null || relationshipId === null || programId === null
        ? ["training", "progress", "none"]
        : trainingKeys.programProgress(
            workspaceId,
            relationshipId,
            programId,
            generation,
            accessContext,
          ),
  });
  const currentWorkoutQuery = useQuery({
    enabled:
      canQuery && relationshipId !== null && readDecisions.workouts.allowed,
    queryFn: ({ signal }) =>
      getCurrentWorkout(apiClient, workspaceId!, relationshipId!, signal),
    queryKey:
      workspaceId === null || relationshipId === null
        ? ["training", "current-workout", "none"]
        : trainingKeys.currentWorkout(
            workspaceId,
            relationshipId,
            generation,
            accessContext,
          ),
  });
  const workoutsQuery = useQuery({
    enabled:
      canQuery && relationshipId !== null && readDecisions.workouts.allowed,
    queryFn: ({ signal }) =>
      listWorkouts(apiClient, workspaceId!, relationshipId!, signal),
    queryKey:
      workspaceId === null || relationshipId === null
        ? ["training", "workouts", "none"]
        : trainingKeys.workouts(
            workspaceId,
            relationshipId,
            generation,
            accessContext,
          ),
  });
  const recordsQuery = useQuery({
    enabled:
      canQuery && relationshipId !== null && readDecisions.records.allowed,
    queryFn: ({ signal }) =>
      listPersonalRecords(apiClient, workspaceId!, relationshipId!, signal),
    queryKey:
      workspaceId === null || relationshipId === null
        ? ["training", "records", "none"]
        : trainingKeys.personalRecords(
            workspaceId,
            relationshipId,
            generation,
            accessContext,
          ),
  });
  const recordEventsQuery = useQuery({
    enabled:
      canQuery && relationshipId !== null && readDecisions.records.allowed,
    queryFn: ({ signal }) =>
      listPersonalRecordEvents(
        apiClient,
        workspaceId!,
        relationshipId!,
        signal,
      ),
    queryKey:
      workspaceId === null || relationshipId === null
        ? ["training", "record-events", "none"]
        : trainingKeys.personalRecordEvents(
            workspaceId,
            relationshipId,
            generation,
            accessContext,
          ),
  });

  const decisions = {
    activateProgram: actionDecision({
      accessContext,
      accessFacts,
      generation,
      membershipId,
      permission: "programs.activate",
      workspaceId,
    }),
    abandonWorkout: actionDecision({
      accessContext,
      accessFacts,
      generation,
      membershipId,
      permission: "workouts.abandon",
      workspaceId,
    }),
    completeWorkout: actionDecision({
      accessContext,
      accessFacts,
      generation,
      membershipId,
      permission: "workouts.complete",
      workspaceId,
    }),
    deferDay: actionDecision({
      accessContext,
      accessFacts,
      generation,
      membershipId,
      permission: "workouts.day.defer",
      workspaceId,
    }),
    skipDay: actionDecision({
      accessContext,
      accessFacts,
      generation,
      membershipId,
      permission: "workouts.day.skip",
      workspaceId,
    }),
    startWorkout: actionDecision({
      accessContext,
      accessFacts,
      generation,
      membershipId,
      permission: "workouts.create",
      workspaceId,
    }),
  };

  const mutation = useMutation({
    mutationFn: async (input: {
      accessContext: AuthorizationCacheContext;
      action: CommandAction;
      generation: number;
      programId: ProgramId | null;
      relationshipId: RelationshipId;
      values: CommandValues;
      workoutId: WorkoutId | null;
      workspaceId: WorkspaceId;
    }) => {
      const expectedVersion = Number(input.values.expectedVersion);
      const body:
        | { expectedVersion: number; reason?: string }
        | Record<string, never>
        | null =
        input.action === "start-workout"
          ? {}
          : Number.isInteger(expectedVersion) && expectedVersion >= 0
            ? {
                expectedVersion,
                ...(input.values.reason.trim()
                  ? { reason: input.values.reason.trim() }
                  : {}),
              }
            : null;
      if (body === null) throw validationError();
      const wireBody =
        input.action === "activate-program" ||
        input.action === "complete-workout"
          ? { expectedVersion: body.expectedVersion as number }
          : body;
      const commandIdentity = {
        action: input.action,
        body: wireBody,
        generation: input.generation,
        accessContext: input.accessContext,
        programId: ["activate-program", "skip-day", "defer-day"].includes(
          input.action,
        )
          ? input.programId
          : undefined,
        relationshipId: input.relationshipId,
        workoutId: ["complete-workout", "abandon-workout"].includes(
          input.action,
        )
          ? input.workoutId
          : undefined,
        workspaceId: input.workspaceId,
      };
      const idempotencyKey = idempotencyKeyForCommand(
        commandOwner,
        commandIdentity,
      );
      const execute = async () => {
        if (input.action === "activate-program" && input.programId !== null) {
          return await activateTrainingProgram(
            apiClient,
            input.workspaceId,
            input.relationshipId,
            input.programId,
            { expectedVersion: body.expectedVersion as number },
            idempotencyKey,
          );
        }
        if (input.action === "start-workout") {
          return await startWorkout(
            apiClient,
            input.workspaceId,
            input.relationshipId,
            idempotencyKey,
          );
        }
        if (input.action === "complete-workout" && input.workoutId !== null) {
          return await completeWorkout(
            apiClient,
            input.workspaceId,
            input.relationshipId,
            input.workoutId,
            { expectedVersion: body.expectedVersion as number },
            idempotencyKey,
          );
        }
        if (input.action === "abandon-workout" && input.workoutId !== null) {
          return await abandonWorkout(
            apiClient,
            input.workspaceId,
            input.relationshipId,
            input.workoutId,
            body as { expectedVersion: number; reason?: string },
            idempotencyKey,
          );
        }
        if (input.action === "skip-day" && input.programId !== null) {
          return await skipProgramDay(
            apiClient,
            input.workspaceId,
            input.relationshipId,
            input.programId,
            body as { expectedVersion: number; reason?: string },
            idempotencyKey,
          );
        }
        if (input.action === "defer-day" && input.programId !== null) {
          return await deferProgramDay(
            apiClient,
            input.workspaceId,
            input.relationshipId,
            input.programId,
            body as { expectedVersion: number; reason?: string },
            idempotencyKey,
          );
        }
        throw validationError();
      };
      return { commandIdentity, response: await execute() };
    },
    onError: (caught, variables) => {
      if (isCurrentContext(variables, currentContextRef.current)) {
        setStatusMessage(null);
        setError(errorMessage(caught, labels));
        setFeedbackContext(
          JSON.stringify([variables.relationshipId, variables.programId]),
        );
      }
    },
    onSuccess: async (data, variables) => {
      commandIdempotencyByOwner
        .get(commandOwner)
        ?.delete(JSON.stringify(data.commandIdentity));
      if (isCurrentContext(variables, currentContextRef.current)) {
        setError(null);
        setStatusMessage(labels.status.saved);
        setFeedbackContext(
          JSON.stringify([variables.relationshipId, variables.programId]),
        );
      }
      await invalidateTraining(queryClient, variables);
    },
    retry: false,
  });

  if (state.status !== "authenticated") {
    return (
      <section className={styles.statePanel} role="status">
        <h1>{labels.loading}</h1>
      </section>
    );
  }

  if (workspaceId === null || selectedWorkspace === null) {
    return (
      <section className={styles.statePanel}>
        <h1>{labels.noWorkspace.title}</h1>
        <p>{labels.noWorkspace.copy}</p>
      </section>
    );
  }

  const pageError =
    relationshipsQuery.error ??
    programsQuery.error ??
    programQuery.error ??
    progressQuery.error ??
    currentWorkoutQuery.error ??
    workoutsQuery.error ??
    recordsQuery.error ??
    recordEventsQuery.error;
  if (pageError) {
    return (
      <section className={styles.statePanel} role="alert">
        <h1>{errorMessage(pageError, labels)}</h1>
      </section>
    );
  }

  if (!readDecisions.relationships.allowed)
    return (
      <section role="status" className={styles.statePanel}>
        <h1>{labels.title}</h1>
        <p>{disabledReason(readDecisions.relationships, labels)}</p>
      </section>
    );
  if (relationshipsQuery.isLoading)
    return (
      <section role="status" className={styles.statePanel}>
        <h1>{labels.loading}</h1>
      </section>
    );

  const currentWorkout = readDecisions.workouts.allowed
    ? (currentWorkoutQuery.data ?? null)
    : null;
  const selectedProgram = readDecisions.programs.allowed
    ? (programQuery.data?.program ?? null)
    : null;
  const progress = progressQuery.data ?? null;
  const workouts = readDecisions.workouts.allowed
    ? (workoutsQuery.data ?? [])
    : [];
  const selectedWorkout =
    workouts.find((workout) => workout.id === selectedWorkoutId) ??
    currentWorkout;

  const submit = (action: CommandAction, decision: AccessDecision) => {
    if (!decision.allowed || relationshipId === null || workspaceId === null) {
      return;
    }
    const values = form.getValues();
    const workoutId = currentWorkout?.id ?? null;
    const targetProgramId =
      action === "complete-workout" || action === "abandon-workout"
        ? (currentWorkout?.programId ?? null)
        : action === "start-workout"
          ? (programs.find((program) => program.status === "ACTIVE")?.id ??
            null)
          : (selectedProgram?.id ?? programId);
    const version =
      action === "activate-program"
        ? selectedProgram?.version
        : action === "complete-workout" || action === "abandon-workout"
          ? currentWorkout?.version
          : progress?.version;
    values.expectedVersion = String(version ?? "");
    if (mutation.isPending) return;
    if (
      !confirmCommand(
        action,
        labels,
        selectedProgram?.name ?? relationshipId,
        currentWorkout?.id ?? relationshipId,
      )
    ) {
      return;
    }
    void runOnce(commandOwner, "training:command", () =>
      mutation.mutateAsync({
        accessContext,
        action,
        generation,
        programId: targetProgramId,
        relationshipId,
        values,
        workoutId,
        workspaceId,
      }),
    );
  };

  return (
    <section aria-labelledby="training-title" className={styles.module}>
      <header className={styles.header}>
        <div>
          <h1 id="training-title">{labels.title}</h1>
          <p>{selectedWorkspace.workspaceName}</p>
        </div>
        <div aria-live="polite" className={styles.feedback}>
          {feedbackContext === JSON.stringify([relationshipId, programId]) &&
          statusMessage ? (
            <p>{statusMessage}</p>
          ) : null}
          {feedbackContext === JSON.stringify([relationshipId, programId]) &&
          error ? (
            <p role="alert">{error}</p>
          ) : null}
        </div>
      </header>

      <div className={styles.grid}>
        {relationshipId ? (
          <ProgramEditor
            key={JSON.stringify([
              generation,
              workspaceId,
              relationshipId,
              accessContext,
            ])}
            workspaceId={workspaceId}
            relationshipId={relationshipId}
            program={
              readDecisions.programs.allowed
                ? (programQuery.data ?? null)
                : null
            }
            labels={labels.editor}
          />
        ) : null}
        <section className={styles.panel}>
          <h2>{labels.panels.relationships}</h2>
          <RelationshipList
            empty={labels.empty.relationships}
            onSelect={setSelectedRelationshipId}
            relationships={relationships}
            labels={labels.values}
            selectedId={relationshipId}
          />
        </section>

        <section className={styles.panel}>
          <h2>{labels.panels.programs}</h2>
          {!readDecisions.programs.allowed ? (
            <p>{disabledReason(readDecisions.programs, labels)}</p>
          ) : null}
          <p className={styles.muted}>{labels.capped}</p>
          <ProgramList
            empty={labels.empty.programs}
            onSelect={setSelectedProgramId}
            programs={programs}
            labels={labels.values}
            selectedId={programId}
          />
          {selectedProgram ? (
            <dl className={styles.details}>
              <dt>{labels.detail.status}</dt>
              <dd>{labels.values[selectedProgram.status]}</dd>
              <dt>{labels.detail.version}</dt>
              <dd>{selectedProgram.version}</dd>
              <dt>{labels.detail.dayCount}</dt>
              <dd>{programQuery.data?.revision.days.length ?? "-"}</dd>
              <dt>{labels.detail.currentDay}</dt>
              <dd>{progress?.currentDaySequence ?? "-"}</dd>
              <dt>{labels.detail.progress}</dt>
              <dd>
                {progress
                  ? `${progress.completedDayCount} / ${progress.skippedDayCount}`
                  : "-"}
              </dd>
            </dl>
          ) : null}
          <CommandFields labels={labels} register={form.register} />
          <div className={styles.actions}>
            <AccessControlledButton
              decision={decisions.activateProgram}
              disabled={
                mutation.isPending || selectedProgram?.status !== "DRAFT"
              }
              disabledReason={disabledReason(decisions.activateProgram, labels)}
              loadingLabel={labels.loading}
              onClick={() =>
                submit("activate-program", decisions.activateProgram)
              }
            >
              {labels.actions.activateProgram}
            </AccessControlledButton>
            <AccessControlledButton
              decision={decisions.skipDay}
              disabled={
                mutation.isPending ||
                selectedProgram?.status !== "ACTIVE" ||
                !progress ||
                !!currentWorkout
              }
              disabledReason={disabledReason(decisions.skipDay, labels)}
              loadingLabel={labels.loading}
              onClick={() => submit("skip-day", decisions.skipDay)}
            >
              {labels.actions.skipDay}
            </AccessControlledButton>
            <AccessControlledButton
              decision={decisions.deferDay}
              disabled={
                mutation.isPending ||
                selectedProgram?.status !== "ACTIVE" ||
                !progress ||
                !!currentWorkout
              }
              disabledReason={disabledReason(decisions.deferDay, labels)}
              loadingLabel={labels.loading}
              onClick={() => submit("defer-day", decisions.deferDay)}
            >
              {labels.actions.deferDay}
            </AccessControlledButton>
          </div>
        </section>

        <section className={styles.panel}>
          <h2>{labels.panels.currentWorkout}</h2>
          {!readDecisions.workouts.allowed ? (
            <p>{disabledReason(readDecisions.workouts, labels)}</p>
          ) : null}
          {currentWorkout ? (
            <dl className={styles.details}>
              <dt>{labels.detail.status}</dt>
              <dd>{labels.values[currentWorkout.status]}</dd>
              <dt>{labels.detail.version}</dt>
              <dd>{currentWorkout.version}</dd>
              <dt>{labels.detail.currentDay}</dt>
              <dd>{currentWorkout.daySequence}</dd>
            </dl>
          ) : (
            <p>{labels.empty.workouts}</p>
          )}
          <div className={styles.actions}>
            <AccessControlledButton
              decision={decisions.startWorkout}
              disabled={
                mutation.isPending ||
                !programs.some((program) => program.status === "ACTIVE") ||
                !!currentWorkout
              }
              disabledReason={disabledReason(decisions.startWorkout, labels)}
              loadingLabel={labels.loading}
              onClick={() => submit("start-workout", decisions.startWorkout)}
            >
              {labels.actions.startWorkout}
            </AccessControlledButton>
            <AccessControlledButton
              decision={decisions.completeWorkout}
              disabled={
                mutation.isPending || currentWorkout?.status !== "IN_PROGRESS"
              }
              disabledReason={disabledReason(decisions.completeWorkout, labels)}
              loadingLabel={labels.loading}
              onClick={() =>
                submit("complete-workout", decisions.completeWorkout)
              }
            >
              {labels.actions.completeWorkout}
            </AccessControlledButton>
            <AccessControlledButton
              decision={decisions.abandonWorkout}
              disabled={
                mutation.isPending || currentWorkout?.status !== "IN_PROGRESS"
              }
              disabledReason={disabledReason(decisions.abandonWorkout, labels)}
              loadingLabel={labels.loading}
              onClick={() =>
                submit("abandon-workout", decisions.abandonWorkout)
              }
            >
              {labels.actions.abandonWorkout}
            </AccessControlledButton>
          </div>
        </section>

        <section className={styles.panel}>
          <h2>{labels.panels.workoutHistory}</h2>
          <p className={styles.muted}>{labels.capped}</p>
          {workouts.length ? (
            <div className={styles.list}>
              {workouts.map((workout) => (
                <button
                  className={styles.itemButton}
                  type="button"
                  key={workout.id}
                  aria-current={selectedWorkout?.id === workout.id}
                  onClick={() => setSelectedWorkoutId(workout.id)}
                >{`${labels.values[workout.status]} · ${workout.id}`}</button>
              ))}
            </div>
          ) : (
            <p>{labels.empty.workouts}</p>
          )}
          {selectedWorkout &&
          relationshipId &&
          selectedWorkout.status !== "ABANDONED" ? (
            <WorkoutEditor
              key={JSON.stringify([
                generation,
                workspaceId,
                relationshipId,
                selectedWorkout.id,
                selectedWorkout.version,
                accessContext,
              ])}
              workout={selectedWorkout}
              workspaceId={workspaceId}
              relationshipId={relationshipId}
              labels={labels.editor}
            />
          ) : null}
        </section>

        <section className={styles.panel}>
          <h2>{labels.panels.personalRecords}</h2>
          {!readDecisions.records.allowed ? (
            <p>{disabledReason(readDecisions.records, labels)}</p>
          ) : null}
          <p className={styles.muted}>{labels.capped}</p>
          <SimpleList
            empty={labels.empty.records}
            items={[
              ...(readDecisions.records.allowed
                ? (recordsQuery.data ?? [])
                : []
              ).map(
                (record) =>
                  `${labels.values[record.recordType]} · ${record.exerciseId} · ${record.value}`,
              ),
              ...(readDecisions.records.allowed
                ? (recordEventsQuery.data ?? [])
                : []
              ).map(
                (event) =>
                  `${labels.values[event.eventType]} · ${event.exerciseId}`,
              ),
            ]}
          />
        </section>
      </div>
    </section>
  );
}

function RelationshipList({
  labels,
  empty,
  onSelect,
  relationships,
  selectedId,
}: {
  empty: string;
  onSelect: (id: RelationshipId) => void;
  relationships: readonly { id: RelationshipId; status: string }[];
  labels: Record<string, string>;
  selectedId: RelationshipId | null;
}) {
  if (relationships.length === 0) return <p>{empty}</p>;
  return (
    <div className={styles.list}>
      {relationships.map((relationship) => (
        <button
          aria-current={relationship.id === selectedId}
          className={styles.itemButton}
          key={relationship.id}
          onClick={() => onSelect(relationship.id)}
          type="button"
        >
          <strong>{labels[relationship.status]}</strong>
          <span>{relationship.id}</span>
        </button>
      ))}
    </div>
  );
}

function ProgramList({
  labels,
  empty,
  onSelect,
  programs,
  selectedId,
}: {
  empty: string;
  onSelect: (id: ProgramId) => void;
  programs: readonly TrainingProgramDto[];
  labels: Record<string, string>;
  selectedId: ProgramId | null;
}) {
  if (programs.length === 0) return <p>{empty}</p>;
  return (
    <div className={styles.list}>
      {programs.map((program) => (
        <button
          aria-current={program.id === selectedId}
          className={styles.itemButton}
          key={program.id}
          onClick={() => onSelect(program.id)}
          type="button"
        >
          <strong>{program.name}</strong>
          <span>{labels[program.status]}</span>
        </button>
      ))}
    </div>
  );
}

function SimpleList({
  empty,
  items,
}: {
  empty: string;
  items: readonly string[];
}) {
  if (items.length === 0) return <p>{empty}</p>;
  return (
    <ul>
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function CommandFields({
  labels,
  register,
}: {
  labels: TrainingLabels;
  register: ReturnType<typeof useForm<CommandValues>>["register"];
}) {
  return (
    <>
      <label className={styles.field}>
        <span>{labels.fields.reason}</span>
        <input type="text" {...register("reason")} />
      </label>
    </>
  );
}

function actionDecision({
  accessContext,
  accessFacts,
  generation,
  membershipId,
  permission,
  workspaceId,
}: {
  accessContext: "support" | "user";
  accessFacts: ReturnType<typeof useStaffWorkspaceContext>["accessFacts"];
  generation: number;
  membershipId?: MembershipId;
  permission: PermissionDecisionDto["permission"];
  workspaceId: WorkspaceId | null;
}): AccessDecision {
  return evaluateAccess(accessFacts, {
    accessContext,
    context: "WORKSPACE",
    permission,
    scope: "workspace",
    sessionGeneration: generation,
    membershipId,
    workspaceId: workspaceId ?? undefined,
  });
}

async function runOnce(
  owner: string,
  key: string,
  action: () => Promise<unknown>,
) {
  const locks = commandLocksByOwner.get(owner) ?? new Set<string>();
  commandLocksByOwner.set(owner, locks);
  if (locks.has(key)) return;
  locks.add(key);
  try {
    await action();
  } catch {
    // React Query owns user-visible mutation errors.
  } finally {
    locks.delete(key);
  }
}

function idempotencyKeyForCommand(owner: string, input: unknown): string {
  const fingerprint = JSON.stringify(input);
  const commands =
    commandIdempotencyByOwner.get(owner) ?? new Map<string, string>();
  commandIdempotencyByOwner.set(owner, commands);
  const existing = commands.get(fingerprint);
  if (existing) return existing;
  const key = createIdempotencyKey();
  commands.set(fingerprint, key);
  return key;
}

async function invalidateTraining(
  queryClient: ReturnType<typeof useQueryClient>,
  input: {
    accessContext: AuthorizationCacheContext;
    generation: number;
    programId: ProgramId | null;
    relationshipId: RelationshipId;
    workspaceId: WorkspaceId;
  },
) {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: trainingKeys.programs(
        input.workspaceId,
        input.relationshipId,
        input.generation,
        input.accessContext,
      ),
    }),
    queryClient.invalidateQueries({
      queryKey: trainingKeys.currentWorkout(
        input.workspaceId,
        input.relationshipId,
        input.generation,
        input.accessContext,
      ),
    }),
    queryClient.invalidateQueries({
      queryKey: trainingKeys.workouts(
        input.workspaceId,
        input.relationshipId,
        input.generation,
        input.accessContext,
      ),
    }),
    queryClient.invalidateQueries({
      queryKey: trainingKeys.personalRecords(
        input.workspaceId,
        input.relationshipId,
        input.generation,
        input.accessContext,
      ),
    }),
    input.programId === null
      ? Promise.resolve()
      : queryClient.invalidateQueries({
          queryKey: trainingKeys.programProgress(
            input.workspaceId,
            input.relationshipId,
            input.programId,
            input.generation,
            input.accessContext,
          ),
        }),
    input.programId === null
      ? Promise.resolve()
      : queryClient.invalidateQueries({
          queryKey: trainingKeys.program(
            input.workspaceId,
            input.relationshipId,
            input.programId,
            input.generation,
            input.accessContext,
          ),
        }),
    queryClient.invalidateQueries({
      queryKey: trainingKeys.personalRecordEvents(
        input.workspaceId,
        input.relationshipId,
        input.generation,
        input.accessContext,
      ),
    }),
  ]);
}

function isCurrentContext(
  command: {
    action: CommandAction;
    accessContext: AuthorizationCacheContext;
    generation: number;
    programId: ProgramId | null;
    relationshipId: RelationshipId;
    workspaceId: WorkspaceId;
  },
  current: {
    accessContext: AuthorizationCacheContext;
    generation: number;
    selectedProgramId: ProgramId | null;
    selectedRelationshipId: RelationshipId | null;
    workspaceId: WorkspaceId | null;
  },
) {
  return (
    command.workspaceId === current.workspaceId &&
    command.relationshipId === current.selectedRelationshipId &&
    (!["activate-program", "skip-day", "defer-day"].includes(command.action) ||
      command.programId === current.selectedProgramId) &&
    command.generation === current.generation &&
    command.accessContext === current.accessContext
  );
}

function confirmCommand(
  action: CommandAction,
  labels: TrainingLabels,
  programTarget: string,
  workoutTarget: string,
) {
  const message = labels.confirm[actionLabel(action)];
  return globalThis.confirm(
    `${message}\n${action.includes("workout") ? workoutTarget : programTarget}`,
  );
}

function actionLabel(action: CommandAction): keyof TrainingLabels["confirm"] {
  if (action === "activate-program") return "activateProgram";
  if (action === "start-workout") return "startWorkout";
  if (action === "complete-workout") return "completeWorkout";
  if (action === "abandon-workout") return "abandonWorkout";
  if (action === "skip-day") return "skipDay";
  return "deferDay";
}

function disabledReason(decision: AccessDecision, labels: TrainingLabels) {
  if (decision.status === "denied") return labels.errors.denied;
  if (decision.status === "unavailable") return labels.errors.accessUnavailable;
  if (decision.status === "unresolved") return labels.loading;
  return labels.errors.denied;
}

function validationError(): ApiError {
  return new ApiError({
    category: "validation",
    code: "WEB_TRAINING_FORM_INVALID",
    kind: "backend",
    message: "Training command is invalid.",
    status: 422,
  });
}

function errorMessage(caught: unknown, labels: TrainingLabels): string {
  if (!isApiError(caught)) return labels.errors.unavailable;
  if (caught.status === 403 || caught.category === "forbidden")
    return labels.errors.denied;
  if (caught.status === 429) return labels.errors.rateLimited;
  if (
    caught.status === 409 ||
    caught.category === "expected-version-conflict" ||
    caught.category === "idempotency-conflict"
  ) {
    return labels.errors.conflict;
  }
  if (caught.status === 422 || caught.category === "validation")
    return labels.errors.validation;
  if (caught.kind === "malformed-response") return labels.errors.malformed;
  return labels.errors.unavailable;
}
