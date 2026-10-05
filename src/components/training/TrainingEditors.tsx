"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useFieldArray,
  useForm,
  type Control,
  type UseFormRegister,
} from "react-hook-form";
import type {
  ExerciseDto,
  ProgramDayType,
  RelationshipId,
  TrainingPrescriptionDto,
  TrainingProgramDetailDto,
  WorkoutSessionDto,
  WorkspaceId,
} from "@/contracts";
import { AccessControlledButton, evaluateAccess } from "@/lib/access";
import { ApiError, createIdempotencyKey, isApiError } from "@/lib/api";
import { useAuthSession } from "@/lib/auth";
import { useStaffWorkspaceContext } from "@/lib/staff-shell";
import {
  correctWorkout,
  createTrainingProgram,
  createTrainingRevision,
  listTrainingExercises,
  patchWorkout,
  trainingKeys,
} from "@/lib/training";
import styles from "./training.module.css";

export type TrainingEditorLabels = {
  addDay: string;
  addExercise: string;
  remove: string;
  name: string;
  dayName: string;
  dayType: string;
  exercise: string;
  sets: string;
  setStructure: string;
  createProgram: string;
  saveRevision: string;
  newProgram: string;
  editProgram: string;
  saveWorkout: string;
  correctWorkout: string;
  correctionReason: string;
  notes: string;
  weight: string;
  reps: string;
  completed: string;
  duration: string;
  distance: string;
  rpe: string;
  rir: string;
  saved: string;
  unavailable: string;
  denied: string;
  conflict: string;
  validation: string;
  rateLimited: string;
  pending: string;
  capped: string;
  noExercises: string;
  dayTypes: Record<ProgramDayType, string>;
  confirmCorrection: string;
};

type ProgramForm = {
  name: string;
  days: {
    dayKey?: string;
    sequence: number;
    name: string;
    type: ProgramDayType;
    exercises: TrainingPrescriptionDto[];
  }[];
};

function useEditorAccess(
  permission: Parameters<typeof evaluateAccess>[1]["permission"],
  workspaceId: WorkspaceId,
) {
  const { generation } = useAuthSession();
  const { accessFacts, shellContext, workspace } = useStaffWorkspaceContext();
  return evaluateAccess(accessFacts, {
    permission,
    workspaceId,
    sessionGeneration: generation,
    accessContext: shellContext?.accessContext ?? "user",
    context: "WORKSPACE",
    membershipId: workspace?.membershipId,
    scope: "workspace",
  });
}

function safeError(error: unknown, labels: TrainingEditorLabels) {
  if (isApiError(error)) {
    if (error.status === 403) return labels.denied;
    if (error.status === 409) return labels.conflict;
    if (error.status === 422) return labels.validation;
    if (error.status === 429) return labels.rateLimited;
  }
  return labels.unavailable;
}

export function ProgramEditor({
  workspaceId,
  relationshipId,
  program,
  labels,
}: {
  workspaceId: WorkspaceId;
  relationshipId: RelationshipId;
  program: TrainingProgramDetailDto | null;
  labels: TrainingEditorLabels;
}) {
  const { apiClient, generation } = useAuthSession();
  const { shellContext } = useStaffWorkspaceContext();
  const accessContext = shellContext?.accessContext ?? "user";
  const queryClient = useQueryClient();
  const [editingExisting, setEditingExisting] = useState(false);
  const selected = editingExisting ? program : null;
  const readAccess = useEditorAccess("exercises.read", workspaceId);
  const createAccess = useEditorAccess("programs.create", workspaceId);
  const reviseAccess = useEditorAccess("programs.update", workspaceId);
  const exercises = useQuery({
    enabled: readAccess.allowed,
    queryKey: trainingKeys.exercises(workspaceId, generation, accessContext),
    queryFn: ({ signal }) =>
      listTrainingExercises(apiClient, workspaceId, signal),
  });
  return (
    <section className={styles.panel}>
      <div className={styles.actions}>
        <AccessControlledButton
          decision={createAccess}
          disabledReason={labels.denied}
          loadingLabel={labels.pending}
          onClick={() => setEditingExisting(false)}
        >
          {labels.newProgram}
        </AccessControlledButton>
        <AccessControlledButton
          decision={reviseAccess}
          disabledReason={labels.denied}
          loadingLabel={labels.pending}
          disabled={
            !program || !["DRAFT", "ACTIVE"].includes(program.program.status)
          }
          onClick={() => setEditingExisting(true)}
        >
          {labels.editProgram}
        </AccessControlledButton>
      </div>
      <p>{labels.capped}</p>
      {exercises.isError ? (
        <p role="alert">{safeError(exercises.error, labels)}</p>
      ) : null}
      <ProgramFormEditor
        key={
          selected
            ? `${selected.program.id}:${selected.program.version}`
            : "new"
        }
        labels={labels}
        program={selected}
        exercises={readAccess.allowed ? (exercises.data ?? []) : []}
        allowed={selected ? reviseAccess.allowed : createAccess.allowed}
        pendingExercises={exercises.isFetching}
        onSave={async (values) => {
          const result = selected
            ? await createTrainingRevision(
                apiClient,
                workspaceId,
                relationshipId,
                selected.program.id,
                {
                  expectedVersion: selected.program.version,
                  days: values.days,
                },
              )
            : await createTrainingProgram(
                apiClient,
                workspaceId,
                relationshipId,
                {
                  name: values.name,
                  source: { type: "SCRATCH" },
                  days: values.days,
                },
              );
          await Promise.all([
            queryClient.invalidateQueries({
              queryKey: trainingKeys.programs(
                workspaceId,
                relationshipId,
                generation,
                accessContext,
              ),
            }),
            queryClient.invalidateQueries({
              queryKey: trainingKeys.program(
                workspaceId,
                relationshipId,
                result.program.id,
                generation,
                accessContext,
              ),
            }),
          ]);
        }}
      />
    </section>
  );
}

function ProgramFormEditor({
  labels,
  program,
  exercises,
  allowed,
  pendingExercises,
  onSave,
}: {
  labels: TrainingEditorLabels;
  program: TrainingProgramDetailDto | null;
  exercises: ExerciseDto[];
  allowed: boolean;
  pendingExercises: boolean;
  onSave: (values: ProgramForm) => Promise<void>;
}) {
  const form = useForm<ProgramForm>({
    defaultValues: {
      name: program?.program.name ?? "",
      days: program
        ? program.revision.days.map((day) => ({
            ...day,
            exercises: day.exercises.map((exercise) => ({ ...exercise })),
          }))
        : [{ name: "", sequence: 1, type: "RESISTANCE", exercises: [] }],
    },
  });
  const days = useFieldArray({ control: form.control, name: "days" });
  const pending = useRef(false);
  const mounted = useRef(true);
  const allowedRef = useRef(allowed);
  useEffect(() => {
    allowedRef.current = allowed;
  }, [allowed]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [ambiguousCreate, setAmbiguousCreate] = useState(false);
  const mutation = useMutation({
    mutationFn: onSave,
    retry: false,
    onSuccess: () => {
      if (mounted.current) {
        setFailed(false);
        setMessage(labels.saved);
        if (!program) form.reset();
      }
    },
    onError: (error) => {
      if (mounted.current) {
        setFailed(true);
        setMessage(safeError(error, labels));
        if (
          !program &&
          (!isApiError(error) ||
            error.status === undefined ||
            error.status >= 500)
        )
          setAmbiguousCreate(true);
      }
    },
  });
  const submit = async (values: ProgramForm) => {
    if (
      !allowedRef.current ||
      !mounted.current ||
      pending.current ||
      ambiguousCreate
    )
      return;
    pending.current = true;
    const days = values.days.map((day, index) => ({
      ...day,
      sequence: program?.program.status === "ACTIVE" ? day.sequence : index + 1,
      exercises: day.exercises.map((exercise, order) => {
        const input = { ...exercise, order: order + 1 };
        delete input.exerciseNameSnapshot;
        return input;
      }),
    }));
    try {
      await mutation.mutateAsync({ ...values, days });
    } catch {
      /* Mutation feedback owns errors. */
    } finally {
      pending.current = false;
    }
  };
  return (
    <form
      onSubmit={(event) => {
        void form.handleSubmit(submit)(event);
      }}
    >
      <h2>{program ? labels.editProgram : labels.newProgram}</h2>
      {message ? <p role={failed ? "alert" : "status"}>{message}</p> : null}
      <fieldset
        disabled={!allowed || mutation.isPending || ambiguousCreate}
        className={styles.editorFields}
      >
        {!program ? (
          <label className={styles.field}>
            <span>{labels.name}</span>
            <input {...form.register("name", { required: true })} required />
          </label>
        ) : null}
        {days.fields.map((day, index) => (
          <fieldset key={day.id} className={styles.editorDay}>
            <legend>
              {labels.dayName} {index + 1}
            </legend>
            <label className={styles.field}>
              <span>{labels.dayName}</span>
              <input
                {...form.register(`days.${index}.name`, { required: true })}
                required
              />
            </label>
            <label className={styles.field}>
              <span>{labels.dayType}</span>
              <select {...form.register(`days.${index}.type`)}>
                {Object.entries(labels.dayTypes).map(([type, text]) => (
                  <option key={type} value={type}>
                    {text}
                  </option>
                ))}
              </select>
            </label>
            <DayExercises
              index={index}
              control={form.control}
              register={form.register}
              labels={labels}
              exercises={exercises}
              active={program?.program.status === "ACTIVE"}
            />
            <button
              type="button"
              disabled={
                days.fields.length <= 1 || program?.program.status === "ACTIVE"
              }
              onClick={() => days.remove(index)}
            >
              {labels.remove}
            </button>
          </fieldset>
        ))}
        <button
          type="button"
          disabled={program?.program.status === "ACTIVE"}
          onClick={() =>
            days.append({
              name: "",
              sequence: days.fields.length + 1,
              type: "RESISTANCE",
              exercises: [],
            })
          }
        >
          {labels.addDay}
        </button>
        <button type="submit" disabled={pendingExercises}>
          {program ? labels.saveRevision : labels.createProgram}
        </button>
      </fieldset>
    </form>
  );
}

function DayExercises({
  index,
  control,
  register,
  labels,
  exercises,
  active,
}: {
  index: number;
  control: Control<ProgramForm>;
  register: UseFormRegister<ProgramForm>;
  labels: TrainingEditorLabels;
  exercises: ExerciseDto[];
  active: boolean;
}) {
  const fields = useFieldArray({ control, name: `days.${index}.exercises` });
  return (
    <div className={styles.editorFields}>
      {fields.fields.map((field, exerciseIndex) => (
        <fieldset className={styles.editorDay} key={field.id}>
          <legend>
            {labels.exercise} {exerciseIndex + 1}
          </legend>
          <label className={styles.field}>
            <span>{labels.exercise}</span>
            <select
              {...register(
                `days.${index}.exercises.${exerciseIndex}.exerciseId`,
                { required: true },
              )}
              required
            >
              {exercises.map((exercise) => (
                <option key={exercise.id} value={exercise.id}>
                  {exercise.names.ar ?? exercise.names.en ?? exercise.id}
                </option>
              ))}
              {!exercises.some(
                (exercise) => exercise.id === field.exerciseId,
              ) ? (
                <option value={field.exerciseId}>
                  {field.exerciseNameSnapshot ?? field.exerciseId}
                </option>
              ) : null}
            </select>
          </label>
          <label className={styles.field}>
            <span>{labels.setStructure}</span>
            <input
              required
              {...register(
                `days.${index}.exercises.${exerciseIndex}.setStructure`,
                { required: true },
              )}
            />
          </label>
          <label className={styles.field}>
            <span>{labels.sets}</span>
            <input
              type="number"
              min="0"
              step="1"
              required
              {...register(
                `days.${index}.exercises.${exerciseIndex}.targetSets`,
                { valueAsNumber: true, min: 0, required: true },
              )}
            />
          </label>
          <button
            type="button"
            disabled={active}
            onClick={() => fields.remove(exerciseIndex)}
          >
            {labels.remove}
          </button>
        </fieldset>
      ))}
      <button
        type="button"
        disabled={active || !exercises.length}
        onClick={() =>
          fields.append({
            exerciseId: exercises[0]!.id,
            order: fields.fields.length + 1,
            targetSets: 3,
            setStructure: "STRAIGHT_SETS",
          })
        }
      >
        {labels.addExercise}
      </button>
      {!exercises.length ? <p>{labels.noExercises}</p> : null}
    </div>
  );
}

type ActualsForm = {
  notes: string;
  reason: string;
  exercises: {
    workoutExerciseKey: string;
    sets: {
      setKey: string;
      weight: string;
      reps: string;
      durationSeconds: string;
      distance: string;
      rpe: string;
      rir: string;
      completed: boolean;
      notes: string;
    }[];
  }[];
};

export function WorkoutEditor({
  workout,
  workspaceId,
  relationshipId,
  labels,
}: {
  workout: WorkoutSessionDto;
  workspaceId: WorkspaceId;
  relationshipId: RelationshipId;
  labels: TrainingEditorLabels;
}) {
  const { apiClient, generation } = useAuthSession();
  const { shellContext } = useStaffWorkspaceContext();
  const accessContext = shellContext?.accessContext ?? "user";
  const queryClient = useQueryClient();
  const correction = workout.status === "COMPLETED";
  const decision = useEditorAccess(
    correction ? "workouts.correct" : "workouts.update",
    workspaceId,
  );
  const form = useForm<ActualsForm>({
    defaultValues: {
      notes: workout.notes ?? "",
      reason: "",
      exercises: workout.exercises.map((exercise) => ({
        workoutExerciseKey: exercise.workoutExerciseKey,
        sets: (exercise.sets ?? []).map((set) => ({
          setKey: set.setKey,
          weight: set.weight?.toString() ?? "",
          reps: set.reps?.toString() ?? "",
          durationSeconds: set.durationSeconds?.toString() ?? "",
          distance: set.distance?.toString() ?? "",
          rpe: set.rpe?.toString() ?? "",
          rir: set.rir?.toString() ?? "",
          completed: set.completed,
          notes: set.notes ?? "",
        })),
      })),
    },
  });
  const lock = useRef(false);
  const commands = useRef(new Map<string, string>());
  const mounted = useRef(true);
  const allowedRef = useRef(decision.allowed);
  useEffect(() => {
    allowedRef.current = decision.allowed;
  }, [decision.allowed]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const mutation = useMutation({
    retry: false,
    mutationFn: async (values: ActualsForm) => {
      const body = {
        expectedVersion: workout.version,
        notes: values.notes,
        exercises: values.exercises.map((exercise) => ({
          workoutExerciseKey: exercise.workoutExerciseKey,
          sets: exercise.sets.map((set) => ({
            setKey: set.setKey,
            completed: set.completed,
            notes: set.notes,
            ...numericActuals(set),
          })),
        })),
      };
      if (correction) {
        const commandBody = { ...body, reason: values.reason };
        const fingerprint = JSON.stringify(commandBody);
        const key = commands.current.get(fingerprint) ?? createIdempotencyKey();
        commands.current.set(fingerprint, key);
        const result = await correctWorkout(
          apiClient,
          workspaceId,
          relationshipId,
          workout.id,
          commandBody,
          key,
        );
        commands.current.delete(fingerprint);
        return result;
      }
      return patchWorkout(
        apiClient,
        workspaceId,
        relationshipId,
        workout.id,
        body,
      );
    },
    onSuccess: async () => {
      if (mounted.current) {
        setMessage(labels.saved);
        setFailed(false);
      }
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: trainingKeys.currentWorkout(
            workspaceId,
            relationshipId,
            generation,
            accessContext,
          ),
        }),
        queryClient.invalidateQueries({
          queryKey: trainingKeys.workouts(
            workspaceId,
            relationshipId,
            generation,
            accessContext,
          ),
        }),
        queryClient.invalidateQueries({
          queryKey: trainingKeys.personalRecords(
            workspaceId,
            relationshipId,
            generation,
            accessContext,
          ),
        }),
        queryClient.invalidateQueries({
          queryKey: trainingKeys.personalRecordEvents(
            workspaceId,
            relationshipId,
            generation,
            accessContext,
          ),
        }),
      ]);
    },
    onError: (error) => {
      if (mounted.current) {
        setMessage(safeError(error, labels));
        setFailed(true);
      }
    },
  });
  const submit = async (values: ActualsForm) => {
    if (!allowedRef.current || !mounted.current || lock.current) return;
    if (
      correction &&
      !globalThis.confirm(`${labels.confirmCorrection}\n${workout.id}`)
    )
      return;
    lock.current = true;
    try {
      await mutation.mutateAsync(values);
    } catch {
      /* Mutation feedback owns errors. */
    } finally {
      lock.current = false;
    }
  };
  return (
    <form
      onSubmit={(event) => {
        void form.handleSubmit(submit)(event);
      }}
    >
      <h3>{correction ? labels.correctWorkout : labels.saveWorkout}</h3>
      {message ? <p role={failed ? "alert" : "status"}>{message}</p> : null}
      <fieldset
        className={styles.editorFields}
        disabled={
          !decision.allowed ||
          mutation.isPending ||
          workout.status === "ABANDONED"
        }
      >
        {workout.exercises.map((exercise, ei) => (
          <fieldset
            className={styles.editorDay}
            key={exercise.workoutExerciseKey}
          >
            <legend>
              {exercise.exerciseNameSnapshot ?? exercise.exerciseId}
            </legend>
            {(exercise.sets ?? []).map((set, si) => (
              <div className={styles.actualSet} key={set.setKey}>
                {(
                  [
                    "weight",
                    "reps",
                    "durationSeconds",
                    "distance",
                    "rpe",
                    "rir",
                  ] as const
                ).map((field) => (
                  <label className={styles.field} key={field}>
                    <span>
                      {field === "durationSeconds"
                        ? labels.duration
                        : labels[field]}
                    </span>
                    <input
                      type="number"
                      min="0"
                      max={field === "rpe" ? 10 : undefined}
                      step={
                        field === "reps" || field === "durationSeconds"
                          ? "1"
                          : "any"
                      }
                      {...form.register(`exercises.${ei}.sets.${si}.${field}`)}
                    />
                  </label>
                ))}
                <label>
                  <input
                    type="checkbox"
                    {...form.register(`exercises.${ei}.sets.${si}.completed`)}
                  />
                  {labels.completed}
                </label>
              </div>
            ))}
          </fieldset>
        ))}
        <label className={styles.field}>
          <span>{labels.notes}</span>
          <textarea {...form.register("notes")} />
        </label>
        {correction ? (
          <label className={styles.field}>
            <span>{labels.correctionReason}</span>
            <input
              required
              {...form.register("reason", {
                required: true,
                validate: (value) => value.trim().length > 0,
              })}
            />
          </label>
        ) : null}
        <button type="submit">
          {correction ? labels.correctWorkout : labels.saveWorkout}
        </button>
      </fieldset>
    </form>
  );
}

function numericActuals(set: ActualsForm["exercises"][number]["sets"][number]) {
  return Object.fromEntries(
    (["weight", "reps", "durationSeconds", "distance", "rpe", "rir"] as const)
      .filter((field) => set[field].trim() !== "")
      .map((field) => {
        const value = Number(set[field]);
        if (
          !Number.isFinite(value) ||
          value < 0 ||
          ((field === "reps" || field === "durationSeconds") &&
            !Number.isInteger(value)) ||
          (field === "rpe" && value > 10)
        )
          throw new ApiError({
            kind: "backend",
            status: 422,
            message: "Invalid workout actuals",
          });
        return [field, value];
      }),
  );
}
