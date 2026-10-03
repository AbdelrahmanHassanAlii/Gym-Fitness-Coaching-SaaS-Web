import type {
  ActivateProgramRequestDto,
  ApiDataEnvelope,
  ExpectedVersionRequestDto,
  PersonalRecordDto,
  PersonalRecordEventDto,
  ProgramId,
  ReasonedExpectedVersionRequestDto,
  RelationshipId,
  TrainingProgramCommandResponseDto,
  TrainingProgramDetailDto,
  TrainingProgramDto,
  TrainingProgramProgressDto,
  TrainingProgressCommandResponseDto,
  WorkoutCommandResponseDto,
  WorkoutId,
  WorkoutSessionDto,
  WorkspaceId,
  ExerciseDto,
  CreateTrainingProgramRequestDto,
  CreateTrainingRevisionRequestDto,
  WorkoutPatchRequestDto,
  WorkoutCorrectionRequestDto,
} from "@/contracts";
import {
  isPersonalRecordDto,
  isPersonalRecordEventDto,
  isTrainingProgramCommandResponseDto,
  isTrainingProgramDetailDto,
  isTrainingProgramDto,
  isTrainingProgramProgressDto,
  isTrainingProgressCommandResponseDto,
  isWorkoutCommandResponseDto,
  isWorkoutEnvelopeDto,
  isExerciseDto,
} from "@/contracts";
import type { ApiClient } from "@/lib/api";
import { ApiError, serializeQueryParams } from "@/lib/api";
import {
  appQueryKeys,
  type AuthorizationCacheContext,
} from "@/lib/server-state";

export const trainingPageLimit = 25;

export const trainingKeys = {
  exercises: (
    workspaceId: WorkspaceId,
    generation: number,
    accessContext: AuthorizationCacheContext = "user",
  ) =>
    appQueryKeys.workspaceList(
      workspaceId,
      "training-exercises",
      { generation, limit: trainingPageLimit },
      accessContext,
    ),
  currentWorkout: (
    workspaceId: WorkspaceId,
    relationshipId: RelationshipId,
    generation: number,
    accessContext: AuthorizationCacheContext = "user",
  ) =>
    appQueryKeys.workspaceDetail(
      workspaceId,
      "training-current-workout",
      { generation, relationshipId },
      accessContext,
    ),
  personalRecordEvents: (
    workspaceId: WorkspaceId,
    relationshipId: RelationshipId,
    generation: number,
    accessContext: AuthorizationCacheContext = "user",
  ) =>
    appQueryKeys.workspaceList(
      workspaceId,
      "training-personal-record-events",
      { generation, limit: trainingPageLimit, relationshipId },
      accessContext,
    ),
  personalRecords: (
    workspaceId: WorkspaceId,
    relationshipId: RelationshipId,
    generation: number,
    accessContext: AuthorizationCacheContext = "user",
  ) =>
    appQueryKeys.workspaceList(
      workspaceId,
      "training-personal-records",
      { generation, limit: trainingPageLimit, relationshipId },
      accessContext,
    ),
  program: (
    workspaceId: WorkspaceId,
    relationshipId: RelationshipId,
    programId: ProgramId,
    generation: number,
    accessContext: AuthorizationCacheContext = "user",
  ) =>
    appQueryKeys.workspaceDetail(
      workspaceId,
      "training-program",
      { generation, programId, relationshipId },
      accessContext,
    ),
  programProgress: (
    workspaceId: WorkspaceId,
    relationshipId: RelationshipId,
    programId: ProgramId,
    generation: number,
    accessContext: AuthorizationCacheContext = "user",
  ) =>
    appQueryKeys.workspaceDetail(
      workspaceId,
      "training-program-progress",
      { generation, programId, relationshipId },
      accessContext,
    ),
  programs: (
    workspaceId: WorkspaceId,
    relationshipId: RelationshipId,
    generation: number,
    accessContext: AuthorizationCacheContext = "user",
  ) =>
    appQueryKeys.workspaceList(
      workspaceId,
      "training-programs",
      { generation, limit: trainingPageLimit, relationshipId },
      accessContext,
    ),
  workouts: (
    workspaceId: WorkspaceId,
    relationshipId: RelationshipId,
    generation: number,
    accessContext: AuthorizationCacheContext = "user",
  ) =>
    appQueryKeys.workspaceList(
      workspaceId,
      "training-workouts",
      { generation, limit: trainingPageLimit, relationshipId },
      accessContext,
    ),
};

export async function listTrainingExercises(
  apiClient: ApiClient,
  workspaceId: WorkspaceId,
  signal?: AbortSignal,
): Promise<ExerciseDto[]> {
  const envelope = await apiClient.request<ApiDataEnvelope<unknown>>({
    method: "GET",
    path: `/workspaces/${workspaceId}/exercises?limit=${trainingPageLimit}`,
    signal,
  });
  const exercises = requireArray(envelope.data, isExerciseDto, "exercises");
  if (
    exercises.some(
      (exercise) =>
        exercise.workspaceId !== undefined &&
        exercise.workspaceId !== workspaceId,
    )
  )
    throw malformed("exercise workspace");
  return exercises;
}

export async function createTrainingProgram(
  apiClient: ApiClient,
  workspaceId: WorkspaceId,
  relationshipId: RelationshipId,
  body: CreateTrainingProgramRequestDto,
): Promise<TrainingProgramDetailDto> {
  return writeTrainingRevision(
    apiClient,
    workspaceId,
    relationshipId,
    `/workspaces/${workspaceId}/relationships/${relationshipId}/programs`,
    body,
  );
}

export async function createTrainingRevision(
  apiClient: ApiClient,
  workspaceId: WorkspaceId,
  relationshipId: RelationshipId,
  programId: ProgramId,
  body: CreateTrainingRevisionRequestDto,
): Promise<TrainingProgramDetailDto> {
  return writeTrainingRevision(
    apiClient,
    workspaceId,
    relationshipId,
    `/workspaces/${workspaceId}/relationships/${relationshipId}/programs/${programId}/revisions`,
    body,
    programId,
  );
}

async function writeTrainingRevision(
  apiClient: ApiClient,
  workspaceId: WorkspaceId,
  relationshipId: RelationshipId,
  path: string,
  body: CreateTrainingProgramRequestDto | CreateTrainingRevisionRequestDto,
  programId?: ProgramId,
) {
  const envelope = await apiClient.request<ApiDataEnvelope<unknown>>({
    method: "POST",
    path,
    body,
  });
  const data = requireShape(
    envelope.data,
    isTrainingProgramDetailDto,
    "program revision",
  );
  if (
    data.program.workspaceId !== workspaceId ||
    data.program.relationshipId !== relationshipId ||
    (programId !== undefined && data.program.id !== programId) ||
    data.program.currentRevisionId !== data.revision.id
  )
    throw malformed("program revision identity");
  return data;
}

export async function patchWorkout(
  apiClient: ApiClient,
  workspaceId: WorkspaceId,
  relationshipId: RelationshipId,
  workoutId: WorkoutId,
  body: WorkoutPatchRequestDto,
) {
  return workoutCommand(
    apiClient,
    "PATCH",
    `/workspaces/${workspaceId}/relationships/${relationshipId}/workouts/${workoutId}`,
    body,
    undefined,
    workspaceId,
    relationshipId,
    workoutId,
  );
}

export async function correctWorkout(
  apiClient: ApiClient,
  workspaceId: WorkspaceId,
  relationshipId: RelationshipId,
  workoutId: WorkoutId,
  body: WorkoutCorrectionRequestDto,
  idempotencyKey: string,
) {
  return workoutCommand(
    apiClient,
    "POST",
    `/workspaces/${workspaceId}/relationships/${relationshipId}/workouts/${workoutId}/corrections`,
    body,
    idempotencyKey,
    workspaceId,
    relationshipId,
    workoutId,
  );
}

export async function listTrainingPrograms(
  apiClient: ApiClient,
  workspaceId: WorkspaceId,
  relationshipId: RelationshipId,
  signal?: AbortSignal,
): Promise<TrainingProgramDto[]> {
  const query = serializeQueryParams({ limit: trainingPageLimit });
  const envelope = await apiClient.request<{
    data: unknown;
    meta?: { hasMore?: unknown; nextCursor?: unknown };
  }>({
    method: "GET",
    path: `/workspaces/${workspaceId}/relationships/${relationshipId}/programs?${query}`,
    signal,
  });
  const programs = requireArray(
    envelope.data,
    isTrainingProgramDto,
    "programs",
  );
  if (
    programs.some(
      (program) =>
        program.workspaceId !== workspaceId ||
        program.relationshipId !== relationshipId,
    )
  ) {
    throw malformed("program identity");
  }

  return programs;
}

export async function getTrainingProgram(
  apiClient: ApiClient,
  workspaceId: WorkspaceId,
  relationshipId: RelationshipId,
  programId: ProgramId,
  signal?: AbortSignal,
): Promise<TrainingProgramDetailDto> {
  const envelope = await apiClient.request<ApiDataEnvelope<unknown>>({
    method: "GET",
    path: `/workspaces/${workspaceId}/relationships/${relationshipId}/programs/${programId}`,
    signal,
  });
  const data = requireShape(
    envelope.data,
    isTrainingProgramDetailDto,
    "program detail",
  );
  if (
    data.program.workspaceId !== workspaceId ||
    data.program.relationshipId !== relationshipId ||
    data.program.id !== programId ||
    data.program.currentRevisionId !== data.revision.id
  ) {
    throw malformed("program detail identity");
  }

  return data;
}

export async function getTrainingProgramProgress(
  apiClient: ApiClient,
  workspaceId: WorkspaceId,
  relationshipId: RelationshipId,
  programId: ProgramId,
  signal?: AbortSignal,
): Promise<TrainingProgramProgressDto> {
  const envelope = await apiClient.request<ApiDataEnvelope<unknown>>({
    method: "GET",
    path: `/workspaces/${workspaceId}/relationships/${relationshipId}/programs/${programId}/progress`,
    signal,
  });
  const data = requireShape(
    envelope.data,
    (value): value is { progress: TrainingProgramProgressDto } =>
      isRecord(value) && isTrainingProgramProgressDto(value.progress),
    "program progress",
  );
  if (data.progress.programId !== programId) {
    throw malformed("program progress identity");
  }

  return data.progress;
}

export async function activateTrainingProgram(
  apiClient: ApiClient,
  workspaceId: WorkspaceId,
  relationshipId: RelationshipId,
  programId: ProgramId,
  body: ActivateProgramRequestDto,
  idempotencyKey: string,
): Promise<TrainingProgramCommandResponseDto> {
  return programCommand(
    apiClient,
    `/workspaces/${workspaceId}/relationships/${relationshipId}/programs/${programId}/activate`,
    body,
    idempotencyKey,
    workspaceId,
    relationshipId,
    programId,
  );
}

export async function getCurrentWorkout(
  apiClient: ApiClient,
  workspaceId: WorkspaceId,
  relationshipId: RelationshipId,
  signal?: AbortSignal,
): Promise<WorkoutSessionDto | null> {
  const envelope = await apiClient.request<ApiDataEnvelope<unknown>>({
    method: "GET",
    path: `/workspaces/${workspaceId}/relationships/${relationshipId}/workouts/current`,
    signal,
  });
  const data = requireShape(
    envelope.data,
    isWorkoutEnvelopeDto,
    "current workout",
  );
  if (
    data.workout !== null &&
    (data.workout.workspaceId !== workspaceId ||
      data.workout.relationshipId !== relationshipId)
  ) {
    throw malformed("current workout identity");
  }

  return data.workout;
}

export async function listWorkouts(
  apiClient: ApiClient,
  workspaceId: WorkspaceId,
  relationshipId: RelationshipId,
  signal?: AbortSignal,
): Promise<WorkoutSessionDto[]> {
  const query = serializeQueryParams({ limit: trainingPageLimit });
  const envelope = await apiClient.request<{ data: unknown }>({
    method: "GET",
    path: `/workspaces/${workspaceId}/relationships/${relationshipId}/workouts?${query}`,
    signal,
  });
  const workouts = requireArray(envelope.data, isWorkout, "workouts");
  if (
    workouts.some(
      (workout) =>
        workout.workspaceId !== workspaceId ||
        workout.relationshipId !== relationshipId,
    )
  ) {
    throw malformed("workout identity");
  }

  return workouts;
}

export async function startWorkout(
  apiClient: ApiClient,
  workspaceId: WorkspaceId,
  relationshipId: RelationshipId,
  idempotencyKey: string,
): Promise<WorkoutCommandResponseDto> {
  return workoutCommand(
    apiClient,
    "POST",
    `/workspaces/${workspaceId}/relationships/${relationshipId}/workouts/start`,
    {},
    idempotencyKey,
    workspaceId,
    relationshipId,
  );
}

export async function completeWorkout(
  apiClient: ApiClient,
  workspaceId: WorkspaceId,
  relationshipId: RelationshipId,
  workoutId: WorkoutId,
  body: ExpectedVersionRequestDto,
  idempotencyKey: string,
): Promise<WorkoutCommandResponseDto> {
  return workoutCommand(
    apiClient,
    "POST",
    `/workspaces/${workspaceId}/relationships/${relationshipId}/workouts/${workoutId}/complete`,
    body,
    idempotencyKey,
    workspaceId,
    relationshipId,
    workoutId,
  );
}

export async function abandonWorkout(
  apiClient: ApiClient,
  workspaceId: WorkspaceId,
  relationshipId: RelationshipId,
  workoutId: WorkoutId,
  body: ReasonedExpectedVersionRequestDto,
  idempotencyKey: string,
): Promise<WorkoutCommandResponseDto> {
  return workoutCommand(
    apiClient,
    "POST",
    `/workspaces/${workspaceId}/relationships/${relationshipId}/workouts/${workoutId}/abandon`,
    body,
    idempotencyKey,
    workspaceId,
    relationshipId,
    workoutId,
  );
}

export async function skipProgramDay(
  apiClient: ApiClient,
  workspaceId: WorkspaceId,
  relationshipId: RelationshipId,
  programId: ProgramId,
  body: ReasonedExpectedVersionRequestDto,
  idempotencyKey: string,
): Promise<TrainingProgressCommandResponseDto> {
  return progressCommand(
    apiClient,
    `/workspaces/${workspaceId}/relationships/${relationshipId}/programs/${programId}/progress/skip`,
    body,
    idempotencyKey,
    programId,
  );
}

export async function deferProgramDay(
  apiClient: ApiClient,
  workspaceId: WorkspaceId,
  relationshipId: RelationshipId,
  programId: ProgramId,
  body: ReasonedExpectedVersionRequestDto,
  idempotencyKey: string,
): Promise<TrainingProgressCommandResponseDto> {
  return progressCommand(
    apiClient,
    `/workspaces/${workspaceId}/relationships/${relationshipId}/programs/${programId}/progress/defer`,
    body,
    idempotencyKey,
    programId,
  );
}

export async function listPersonalRecords(
  apiClient: ApiClient,
  workspaceId: WorkspaceId,
  relationshipId: RelationshipId,
  signal?: AbortSignal,
): Promise<PersonalRecordDto[]> {
  const query = serializeQueryParams({ limit: trainingPageLimit });
  const envelope = await apiClient.request<{ data: unknown }>({
    method: "GET",
    path: `/workspaces/${workspaceId}/relationships/${relationshipId}/personal-records?${query}`,
    signal,
  });
  return requireArray(envelope.data, isPersonalRecordDto, "personal records");
}

export async function listPersonalRecordEvents(
  apiClient: ApiClient,
  workspaceId: WorkspaceId,
  relationshipId: RelationshipId,
  signal?: AbortSignal,
): Promise<PersonalRecordEventDto[]> {
  const query = serializeQueryParams({ limit: trainingPageLimit });
  const envelope = await apiClient.request<{ data: unknown }>({
    method: "GET",
    path: `/workspaces/${workspaceId}/relationships/${relationshipId}/personal-record-events?${query}`,
    signal,
  });
  return requireArray(
    envelope.data,
    isPersonalRecordEventDto,
    "personal record events",
  );
}

async function programCommand(
  apiClient: ApiClient,
  path: string,
  body: ActivateProgramRequestDto,
  idempotencyKey: string,
  workspaceId: WorkspaceId,
  relationshipId: RelationshipId,
  programId: ProgramId,
) {
  const envelope = await apiClient.request<ApiDataEnvelope<unknown>>({
    body,
    idempotencyKey,
    method: "POST",
    path,
  });
  const data = requireShape(
    envelope.data,
    isTrainingProgramCommandResponseDto,
    "program command",
  );
  if (
    data.program.workspaceId !== workspaceId ||
    data.program.relationshipId !== relationshipId ||
    data.program.id !== programId
  ) {
    throw malformed("program command identity");
  }

  return data;
}

async function workoutCommand(
  apiClient: ApiClient,
  method: "POST" | "PATCH",
  path: string,
  body:
    | ExpectedVersionRequestDto
    | ReasonedExpectedVersionRequestDto
    | WorkoutPatchRequestDto
    | Record<string, never>,
  idempotencyKey: string | undefined,
  workspaceId: WorkspaceId,
  relationshipId: RelationshipId,
  workoutId?: WorkoutId,
) {
  const envelope = await apiClient.request<ApiDataEnvelope<unknown>>({
    body,
    idempotencyKey,
    method,
    path,
  });
  const data = requireShape(
    envelope.data,
    isWorkoutCommandResponseDto,
    "workout command",
  );
  if (
    data.workout.workspaceId !== workspaceId ||
    data.workout.relationshipId !== relationshipId ||
    (workoutId !== undefined && data.workout.id !== workoutId)
  ) {
    throw malformed("workout command identity");
  }

  return data;
}

async function progressCommand(
  apiClient: ApiClient,
  path: string,
  body: ReasonedExpectedVersionRequestDto,
  idempotencyKey: string,
  programId: ProgramId,
) {
  const envelope = await apiClient.request<ApiDataEnvelope<unknown>>({
    body,
    idempotencyKey,
    method: "POST",
    path,
  });
  const data = requireShape(
    envelope.data,
    isTrainingProgressCommandResponseDto,
    "progress command",
  );
  if (data.progress.programId !== programId) {
    throw malformed("progress command identity");
  }

  return data;
}

function requireArray<T>(
  value: unknown,
  guard: (item: unknown) => item is T,
  label: string,
): T[] {
  if (!Array.isArray(value) || !value.every(guard)) {
    throw malformed(label);
  }

  return value;
}

function requireShape<T>(
  value: unknown,
  guard: (item: unknown) => item is T,
  label: string,
): T {
  if (!guard(value)) {
    throw malformed(label);
  }

  return value;
}

function malformed(label: string): ApiError {
  return new ApiError({
    code: "WEB_MALFORMED_RESPONSE",
    kind: "malformed-response",
    message: `Malformed ${label} response.`,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isWorkout(value: unknown): value is WorkoutSessionDto {
  return isWorkoutCommandResponseDto({ workout: value });
}
