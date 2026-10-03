import { describe, expect, test, vi } from "vitest";
import type {
  ApiDataEnvelope,
  PersonalRecordDto,
  ProgramId,
  RelationshipId,
  TrainingProgramDto,
  TrainingProgramRevisionDto,
  TrainingProgramProgressDto,
  WorkoutId,
  WorkoutSessionDto,
  WorkspaceId,
} from "@/contracts";
import { ApiError } from "@/lib/api";
import type { ApiClient, ApiRequestOptions } from "@/lib/api";
import {
  activateTrainingProgram,
  abandonWorkout,
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
  listTrainingExercises,
  createTrainingProgram,
  createTrainingRevision,
  patchWorkout,
  correctWorkout,
} from ".";

const workspaceId = "workspace_a" as WorkspaceId;
const relationshipId = "relationship_a" as RelationshipId;
const programId = "program_a" as ProgramId;
const workoutId = "workout_a" as WorkoutId;

describe("training API", () => {
  test("authoring and correction preserve exact non-idempotent versus idempotent contracts", async () => {
    const api = fakeApiClient([
      {
        data: [
          {
            id: "exercise_a",
            scope: "SYSTEM",
            names: { en: "Squat" },
            exerciseType: "RESISTANCE",
            status: "ACTIVE",
            version: 0,
            primaryMuscles: [],
            secondaryMuscles: [],
            equipment: [],
          },
        ],
      },
      { data: { program: program(), revision: revision() } },
      { data: { program: program(), revision: revision() } },
      { data: { workout: workout() } },
      { data: { workout: workout({ status: "COMPLETED" }) } },
    ]);
    await listTrainingExercises(api, workspaceId);
    const days = [...revision().days];
    const createBody = {
      name: "Strength Block",
      source: { type: "SCRATCH" as const },
      days,
    };
    await createTrainingProgram(api, workspaceId, relationshipId, createBody);
    await createTrainingRevision(api, workspaceId, relationshipId, programId, {
      expectedVersion: 7,
      days,
    });
    await patchWorkout(api, workspaceId, relationshipId, workoutId, {
      expectedVersion: 7,
      exercises: [],
    });
    await correctWorkout(
      api,
      workspaceId,
      relationshipId,
      workoutId,
      { expectedVersion: 7, exercises: [], reason: "Verified correction" },
      "correction-command-key",
    );
    expect(api.calls).toEqual([
      { method: "GET", path: "/workspaces/workspace_a/exercises?limit=25" },
      {
        method: "POST",
        path: "/workspaces/workspace_a/relationships/relationship_a/programs",
        body: createBody,
      },
      {
        method: "POST",
        path: "/workspaces/workspace_a/relationships/relationship_a/programs/program_a/revisions",
        body: { expectedVersion: 7, days },
      },
      {
        method: "PATCH",
        path: "/workspaces/workspace_a/relationships/relationship_a/workouts/workout_a",
        body: { expectedVersion: 7, exercises: [] },
        idempotencyKey: undefined,
      },
      {
        method: "POST",
        path: "/workspaces/workspace_a/relationships/relationship_a/workouts/workout_a/corrections",
        body: {
          expectedVersion: 7,
          exercises: [],
          reason: "Verified correction",
        },
        idempotencyKey: "correction-command-key",
      },
    ]);
  });

  test("exercise and new revision responses reject cross-workspace and wrong revision identities", async () => {
    await expect(
      listTrainingExercises(
        fakeApiClient([
          {
            data: [
              {
                id: "exercise_a",
                scope: "GYM",
                workspaceId: "workspace_b",
                names: { en: "Squat" },
                exerciseType: "RESISTANCE",
                status: "ACTIVE",
                version: 0,
                primaryMuscles: [],
                secondaryMuscles: [],
                equipment: [],
              },
            ],
          },
        ]),
        workspaceId,
      ),
    ).rejects.toMatchObject({ kind: "malformed-response" });
    await expect(
      createTrainingRevision(
        fakeApiClient([
          {
            data: {
              program: program(),
              revision: { ...revision(), id: "wrong_revision" },
            },
          },
        ]),
        workspaceId,
        relationshipId,
        programId,
        { expectedVersion: 7, days: [] },
      ),
    ).rejects.toMatchObject({ kind: "malformed-response" });
  });
  test("accepts Backend REP_AT_WEIGHT records and rejects malformed versions and dates", async () => {
    const records = fakeApiClient([
      { data: [record({ recordType: "REP_AT_WEIGHT" })] },
    ]);
    expect(
      await listPersonalRecords(records, workspaceId, relationshipId),
    ).toEqual([record({ recordType: "REP_AT_WEIGHT" })]);
    for (const invalid of [
      workout({ version: -1 }),
      workout({ version: 1.5 }),
      workout({ startedAt: "2026-02-30T00:00:00.000Z" }),
    ]) {
      await expect(
        getCurrentWorkout(
          fakeApiClient([{ data: { workout: invalid } }]),
          workspaceId,
          relationshipId,
        ),
      ).rejects.toMatchObject({ kind: "malformed-response" });
    }
  });

  test("path-sensitive response IDs fail closed before becoming route selections", async () => {
    for (const id of ["", "../other", "program?redirect=1", "program\\other"]) {
      await expect(
        listTrainingPrograms(
          fakeApiClient([{ data: [program({ id: id as ProgramId })] }]),
          workspaceId,
          relationshipId,
        ),
      ).rejects.toMatchObject({ kind: "malformed-response" });
    }
  });
  test("uses exact relationship-scoped read routes", async () => {
    const apiClient = fakeApiClient([
      { data: [program()] },
      { data: { program: program(), revision: revision() } },
      { data: { progress: progress() } },
      { data: { workout: workout() } },
      { data: [workout()] },
      { data: [record()] },
      { data: [recordEvent()] },
    ]);

    await listTrainingPrograms(apiClient, workspaceId, relationshipId);
    await getTrainingProgram(apiClient, workspaceId, relationshipId, programId);
    await getTrainingProgramProgress(
      apiClient,
      workspaceId,
      relationshipId,
      programId,
    );
    await getCurrentWorkout(apiClient, workspaceId, relationshipId);
    await listWorkouts(apiClient, workspaceId, relationshipId);
    await listPersonalRecords(apiClient, workspaceId, relationshipId);
    await listPersonalRecordEvents(apiClient, workspaceId, relationshipId);

    expect(apiClient.calls).toEqual([
      {
        method: "GET",
        path: "/workspaces/workspace_a/relationships/relationship_a/programs?limit=25",
      },
      {
        method: "GET",
        path: "/workspaces/workspace_a/relationships/relationship_a/programs/program_a",
      },
      {
        method: "GET",
        path: "/workspaces/workspace_a/relationships/relationship_a/programs/program_a/progress",
      },
      {
        method: "GET",
        path: "/workspaces/workspace_a/relationships/relationship_a/workouts/current",
      },
      {
        method: "GET",
        path: "/workspaces/workspace_a/relationships/relationship_a/workouts?limit=25",
      },
      {
        method: "GET",
        path: "/workspaces/workspace_a/relationships/relationship_a/personal-records?limit=25",
      },
      {
        method: "GET",
        path: "/workspaces/workspace_a/relationships/relationship_a/personal-record-events?limit=25",
      },
    ]);
  });

  test("uses exact idempotent command routes and expectedVersion bodies", async () => {
    const apiClient = fakeApiClient([
      { data: { program: program({ status: "ACTIVE", version: 8 }) } },
      { data: { workout: workout({ id: "workout_b" as WorkoutId }) } },
      { data: { workout: workout({ status: "COMPLETED", version: 8 }) } },
      { data: { workout: workout({ status: "ABANDONED", version: 8 }) } },
      { data: { progress: progress({ skippedDayCount: 1, version: 4 }) } },
      { data: { progress: progress({ version: 4 }) } },
    ]);

    await activateTrainingProgram(
      apiClient,
      workspaceId,
      relationshipId,
      programId,
      { expectedVersion: 7 },
      "activate-key",
    );
    await startWorkout(apiClient, workspaceId, relationshipId, "start-key");
    await completeWorkout(
      apiClient,
      workspaceId,
      relationshipId,
      workoutId,
      { expectedVersion: 7 },
      "complete-key",
    );
    await abandonWorkout(
      apiClient,
      workspaceId,
      relationshipId,
      workoutId,
      { expectedVersion: 7, reason: "injury" },
      "abandon-key",
    );
    await skipProgramDay(
      apiClient,
      workspaceId,
      relationshipId,
      programId,
      { expectedVersion: 3, reason: "travel" },
      "skip-key",
    );
    await deferProgramDay(
      apiClient,
      workspaceId,
      relationshipId,
      programId,
      { expectedVersion: 3 },
      "defer-key",
    );

    expect(apiClient.calls).toEqual([
      {
        body: { expectedVersion: 7 },
        idempotencyKey: "activate-key",
        method: "POST",
        path: "/workspaces/workspace_a/relationships/relationship_a/programs/program_a/activate",
      },
      {
        body: {},
        idempotencyKey: "start-key",
        method: "POST",
        path: "/workspaces/workspace_a/relationships/relationship_a/workouts/start",
      },
      {
        body: { expectedVersion: 7 },
        idempotencyKey: "complete-key",
        method: "POST",
        path: "/workspaces/workspace_a/relationships/relationship_a/workouts/workout_a/complete",
      },
      {
        body: { expectedVersion: 7, reason: "injury" },
        idempotencyKey: "abandon-key",
        method: "POST",
        path: "/workspaces/workspace_a/relationships/relationship_a/workouts/workout_a/abandon",
      },
      {
        body: { expectedVersion: 3, reason: "travel" },
        idempotencyKey: "skip-key",
        method: "POST",
        path: "/workspaces/workspace_a/relationships/relationship_a/programs/program_a/progress/skip",
      },
      {
        body: { expectedVersion: 3 },
        idempotencyKey: "defer-key",
        method: "POST",
        path: "/workspaces/workspace_a/relationships/relationship_a/programs/program_a/progress/defer",
      },
    ]);
  });

  test("fails closed on malformed or cross-context training responses", async () => {
    await expect(
      listTrainingPrograms(
        fakeApiClient([
          {
            data: [
              program({
                relationshipId: "relationship_b" as RelationshipId,
              }),
            ],
          },
        ]),
        workspaceId,
        relationshipId,
      ),
    ).rejects.toMatchObject({
      kind: "malformed-response",
    } satisfies Partial<ApiError>);

    await expect(
      getCurrentWorkout(
        fakeApiClient([
          {
            data: {
              workout: workout({ workspaceId: "workspace_b" as WorkspaceId }),
            },
          },
        ]),
        workspaceId,
        relationshipId,
      ),
    ).rejects.toMatchObject({
      kind: "malformed-response",
    } satisfies Partial<ApiError>);
  });

  test("query keys are session, workspace, relationship, resource, and context scoped", () => {
    const userKey = trainingKeys.programs(
      workspaceId,
      relationshipId,
      1,
      "user",
    );
    const supportKey = trainingKeys.programs(
      workspaceId,
      relationshipId,
      1,
      "support",
    );
    const relationshipBKey = trainingKeys.programs(
      workspaceId,
      "relationship_b" as RelationshipId,
      1,
      "user",
    );

    expect(userKey).toEqual(
      trainingKeys.programs(workspaceId, relationshipId, 1, "user"),
    );
    expect(userKey).not.toEqual(supportKey);
    expect(userKey).not.toEqual(relationshipBKey);
    expect(JSON.stringify(userKey)).not.toMatch(
      /accessToken|refresh|cookie|supportSessionId|x-support-session-id/i,
    );
  });
});

function fakeApiClient(responses: ApiDataEnvelope<unknown>[]) {
  const calls: ApiRequestOptions[] = [];
  const request = vi.fn(async (options: ApiRequestOptions) => {
    calls.push(stripVolatile(options));
    return responses.shift();
  });

  return {
    calls,
    request,
  } as unknown as ApiClient & { calls: ApiRequestOptions[] };
}

function stripVolatile(options: ApiRequestOptions): ApiRequestOptions {
  const rest = { ...options };
  delete rest.signal;
  return rest;
}

function program(input: Partial<TrainingProgramDto> = {}): TrainingProgramDto {
  return {
    currentRevisionId: "revision_a" as TrainingProgramDto["currentRevisionId"],
    id: programId,
    name: "Strength Block",
    relationshipId,
    status: "DRAFT",
    version: 7,
    workspaceId,
    ...input,
  };
}

function revision(): TrainingProgramRevisionDto {
  return {
    days: [
      {
        exercises: [
          {
            exerciseId: "exercise_a" as import("@/contracts").ExerciseId,
            exerciseNameSnapshot: "Squat",
            order: 1,
            setStructure: "STRAIGHT_SETS",
            targetSets: 3,
          },
        ],
        name: "Lower",
        sequence: 1,
        type: "RESISTANCE",
      },
    ],
    id: "revision_a" as import("@/contracts").ProgramRevisionId,
    revision: 1,
  };
}

function progress(
  input: Partial<TrainingProgramProgressDto> = {},
): TrainingProgramProgressDto {
  return {
    completedDayCount: 0,
    currentDaySequence: 1,
    programId,
    programRevisionId:
      "revision_a" as TrainingProgramProgressDto["programRevisionId"],
    skippedDayCount: 0,
    version: 3,
    ...input,
  };
}

function workout(input: Partial<WorkoutSessionDto> = {}): WorkoutSessionDto {
  return {
    daySequence: 1,
    exercises: [
      {
        exerciseId:
          "exercise_a" as WorkoutSessionDto["exercises"][number]["exerciseId"],
        exerciseNameSnapshot: "Squat",
        workoutExerciseKey: "wx-1",
      },
    ],
    id: workoutId,
    performedByUserId: "user_a" as WorkoutSessionDto["performedByUserId"],
    programId,
    programRevisionId: "revision_a" as WorkoutSessionDto["programRevisionId"],
    relationshipId,
    startedAt: "2026-01-01T00:00:00.000Z",
    status: "IN_PROGRESS",
    traineeUserId: "trainee_a" as WorkoutSessionDto["traineeUserId"],
    version: 7,
    workspaceId,
    ...input,
  };
}

function record(input: Partial<PersonalRecordDto> = {}): PersonalRecordDto {
  return {
    exerciseId: "exercise_a" as PersonalRecordDto["exerciseId"],
    id: "record_a" as PersonalRecordDto["id"],
    qualifierKey: "",
    recordType: "MAX_WEIGHT",
    sourceWorkoutId: workoutId,
    sourceWorkoutVersion: 7,
    value: 120,
    ...input,
  };
}

function recordEvent() {
  return {
    eventType: "ACHIEVED",
    exerciseId: "exercise_a",
    id: "event_a",
    newValue: 120,
    occurredAt: "2026-01-01T00:00:00.000Z",
    qualifierKey: "",
    recordType: "MAX_WEIGHT",
    sourceWorkoutId: workoutId,
    sourceWorkoutVersion: 7,
  };
}
