import type {
  ExerciseId,
  PersonalRecordEventId,
  PersonalRecordId,
  ProgramId,
  ProgramRevisionId,
  RelationshipId,
  UserId,
  WorkoutId,
  WorkspaceId,
} from "@/contracts/common/ids";

export const programStatuses = [
  "DRAFT",
  "ACTIVE",
  "REPLACED",
  "COMPLETED",
  "ARCHIVED",
] as const;

export const workoutStatuses = [
  "IN_PROGRESS",
  "COMPLETED",
  "ABANDONED",
] as const;

export const programDayTypes = [
  "RESISTANCE",
  "CARDIO",
  "RECOVERY",
  "REST",
  "CUSTOM",
] as const;

export const personalRecordTypes = [
  "MAX_WEIGHT",
  "REP_AT_WEIGHT",
  "ESTIMATED_1RM",
] as const;
export const personalRecordEventTypes = [
  "ACHIEVED",
  "ADJUSTED",
  "RETRACTED",
] as const;

export type ProgramStatus = (typeof programStatuses)[number];
export type WorkoutStatus = (typeof workoutStatuses)[number];
export type ProgramDayType = (typeof programDayTypes)[number];
export type PersonalRecordType = (typeof personalRecordTypes)[number];
export type PersonalRecordEventType = (typeof personalRecordEventTypes)[number];

export interface TrainingPrescriptionDto {
  exerciseId: ExerciseId;
  exerciseNameSnapshot?: string;
  groupId?: string;
  groupType?: string;
  notes?: string;
  order: number;
  prescriptionId?: string;
  repRange?: { max?: number; min?: number };
  restSeconds?: number;
  rir?: number;
  rpe?: number;
  setStructure: string;
  targetSets: number;
  targetWeight?: number;
  tempo?: string;
}

export interface TrainingProgramDayDto {
  dayKey?: string;
  exercises: readonly TrainingPrescriptionDto[];
  name: string;
  sequence: number;
  type: ProgramDayType;
}

export interface TrainingProgramDto {
  currentRevisionId: ProgramRevisionId;
  endedAt?: string;
  id: ProgramId;
  name: string;
  relationshipId: RelationshipId;
  sourceProgramId?: ProgramId;
  sourceProgramRevisionId?: ProgramRevisionId;
  sourceTemplateId?: string;
  sourceTemplateRevisionId?: string;
  startedAt?: string;
  status: ProgramStatus;
  version: number;
  workspaceId: WorkspaceId;
}

export interface TrainingProgramRevisionDto {
  days: readonly TrainingProgramDayDto[];
  id: ProgramRevisionId;
  revision: number;
}

export interface TrainingProgramDetailDto {
  program: TrainingProgramDto;
  revision: TrainingProgramRevisionDto;
}

export interface TrainingProgramProgressDto {
  completedDayCount: number;
  currentDaySequence: number;
  programId: ProgramId;
  programRevisionId: ProgramRevisionId;
  skippedDayCount: number;
  version: number;
}

export interface WorkoutActualSetDto {
  completed: boolean;
  distance?: number;
  durationSeconds?: number;
  notes?: string;
  reps?: number;
  rir?: number;
  rpe?: number;
  setKey: string;
  weight?: number;
}

export interface WorkoutExerciseDto {
  exerciseId: ExerciseId;
  exerciseNameSnapshot?: string;
  sets?: readonly WorkoutActualSetDto[];
  workoutExerciseKey: string;
}

export interface WorkoutSessionDto {
  abandonedAt?: string;
  abandonmentReason?: string;
  completedAt?: string;
  dayKey?: string;
  daySequence: number;
  exercises: readonly WorkoutExerciseDto[];
  id: WorkoutId;
  notes?: string;
  performedByUserId: UserId;
  programId: ProgramId;
  programRevisionId: ProgramRevisionId;
  relationshipId: RelationshipId;
  startedAt: string;
  status: WorkoutStatus;
  traineeEditableUntil?: string;
  traineeUserId: UserId;
  version: number;
  workspaceId: WorkspaceId;
}

export interface WorkoutEnvelopeDto {
  workout: WorkoutSessionDto | null;
}

export interface WorkoutCommandResponseDto {
  workout: WorkoutSessionDto;
}

export interface TrainingProgramCommandResponseDto {
  program: TrainingProgramDto;
}

export interface TrainingProgressCommandResponseDto {
  progress: TrainingProgramProgressDto;
}

export interface ExpectedVersionRequestDto {
  expectedVersion: number;
}

export interface ReasonedExpectedVersionRequestDto extends ExpectedVersionRequestDto {
  reason?: string;
}

export interface ActivateProgramRequestDto extends ExpectedVersionRequestDto {
  effectiveAt?: string;
}

export interface ExerciseDto {
  id: ExerciseId;
  scope: "SYSTEM" | "GYM" | "PRIVATE";
  workspaceId?: WorkspaceId;
  names: { ar?: string; en?: string };
  exerciseType: string;
  primaryMuscles: readonly string[];
  secondaryMuscles: readonly string[];
  equipment: readonly string[];
  status: "ACTIVE" | "ARCHIVED";
  version: number;
}

export interface CreateTrainingProgramRequestDto {
  name: string;
  source: { type: "SCRATCH" };
  days: TrainingProgramDayRequestDto[];
}

export interface CreateTrainingRevisionRequestDto extends ExpectedVersionRequestDto {
  days: TrainingProgramDayRequestDto[];
}

export type TrainingPrescriptionRequestDto = Omit<
  TrainingPrescriptionDto,
  "exerciseNameSnapshot"
>;
export type TrainingProgramDayRequestDto = Omit<
  TrainingProgramDayDto,
  "exercises"
> & { exercises: TrainingPrescriptionRequestDto[] };

export interface WorkoutPatchRequestDto extends ExpectedVersionRequestDto {
  exercises: { workoutExerciseKey: string; sets: WorkoutActualSetDto[] }[];
  notes?: string;
  clientMutationId?: string;
}

export interface WorkoutCorrectionRequestDto extends WorkoutPatchRequestDto {
  reason: string;
}

export function isExerciseDto(value: unknown): value is ExerciseDto {
  return (
    isRecord(value) &&
    idField(value.id) &&
    ["SYSTEM", "GYM", "PRIVATE"].includes(String(value.scope)) &&
    (value.scope === "SYSTEM"
      ? value.workspaceId === undefined
      : idField(value.workspaceId)) &&
    isRecord(value.names) &&
    optionalString(value.names.ar) &&
    optionalString(value.names.en) &&
    typeof value.exerciseType === "string" &&
    ["ACTIVE", "ARCHIVED"].includes(String(value.status)) &&
    versionField(value.version) &&
    [value.primaryMuscles, value.secondaryMuscles, value.equipment].every(
      (items) =>
        Array.isArray(items) && items.every((item) => typeof item === "string"),
    )
  );
}

export interface PersonalRecordDto {
  exerciseId: ExerciseId;
  id: PersonalRecordId;
  qualifierKey: string;
  recordType: PersonalRecordType;
  sourceWorkoutId: WorkoutId;
  sourceWorkoutVersion: number;
  value: number;
}

export interface PersonalRecordEventDto {
  eventType: PersonalRecordEventType;
  exerciseId: ExerciseId;
  id: PersonalRecordEventId;
  newValue?: number;
  occurredAt: string;
  previousValue?: number;
  qualifierKey: string;
  recordType: PersonalRecordType;
  sourceWorkoutId: WorkoutId;
  sourceWorkoutVersion: number;
}

export const isTrainingProgramDto = (
  value: unknown,
): value is TrainingProgramDto =>
  isRecord(value) &&
  idField(value.id) &&
  idField(value.workspaceId) &&
  idField(value.relationshipId) &&
  typeof value.name === "string" &&
  typeof value.status === "string" &&
  programStatusSet.has(value.status) &&
  idField(value.currentRevisionId) &&
  versionField(value.version) &&
  optionalTimestamp(value.startedAt) &&
  optionalTimestamp(value.endedAt) &&
  optionalString(value.sourceTemplateId) &&
  optionalString(value.sourceTemplateRevisionId) &&
  optionalString(value.sourceProgramId) &&
  optionalString(value.sourceProgramRevisionId);

export const isTrainingProgramDetailDto = (
  value: unknown,
): value is TrainingProgramDetailDto =>
  isRecord(value) &&
  isTrainingProgramDto(value.program) &&
  isTrainingProgramRevisionDto(value.revision);

export const isTrainingProgramProgressDto = (
  value: unknown,
): value is TrainingProgramProgressDto =>
  isRecord(value) &&
  idField(value.programId) &&
  idField(value.programRevisionId) &&
  versionField(value.currentDaySequence) &&
  versionField(value.completedDayCount) &&
  versionField(value.skippedDayCount) &&
  versionField(value.version);

export const isWorkoutEnvelopeDto = (
  value: unknown,
): value is WorkoutEnvelopeDto =>
  isRecord(value) &&
  (value.workout === null || isWorkoutSessionDto(value.workout));

export const isWorkoutCommandResponseDto = (
  value: unknown,
): value is WorkoutCommandResponseDto =>
  isRecord(value) && isWorkoutSessionDto(value.workout);

export const isTrainingProgramCommandResponseDto = (
  value: unknown,
): value is TrainingProgramCommandResponseDto =>
  isRecord(value) && isTrainingProgramDto(value.program);

export const isTrainingProgressCommandResponseDto = (
  value: unknown,
): value is TrainingProgressCommandResponseDto =>
  isRecord(value) && isTrainingProgramProgressDto(value.progress);

export const isPersonalRecordDto = (
  value: unknown,
): value is PersonalRecordDto =>
  isRecord(value) &&
  idField(value.id) &&
  idField(value.exerciseId) &&
  typeof value.recordType === "string" &&
  personalRecordTypeSet.has(value.recordType) &&
  typeof value.qualifierKey === "string" &&
  numberField(value.value) &&
  idField(value.sourceWorkoutId) &&
  versionField(value.sourceWorkoutVersion);

export const isPersonalRecordEventDto = (
  value: unknown,
): value is PersonalRecordEventDto =>
  isRecord(value) &&
  idField(value.id) &&
  idField(value.exerciseId) &&
  typeof value.recordType === "string" &&
  personalRecordTypeSet.has(value.recordType) &&
  typeof value.qualifierKey === "string" &&
  typeof value.eventType === "string" &&
  personalRecordEventTypeSet.has(value.eventType) &&
  optionalNumber(value.previousValue) &&
  optionalNumber(value.newValue) &&
  idField(value.sourceWorkoutId) &&
  versionField(value.sourceWorkoutVersion) &&
  timestamp(value.occurredAt);

function isTrainingProgramRevisionDto(
  value: unknown,
): value is TrainingProgramRevisionDto {
  return (
    isRecord(value) &&
    idField(value.id) &&
    versionField(value.revision) &&
    Array.isArray(value.days) &&
    value.days.every(isTrainingProgramDayDto)
  );
}

function isTrainingProgramDayDto(
  value: unknown,
): value is TrainingProgramDayDto {
  return (
    isRecord(value) &&
    optionalString(value.dayKey) &&
    numberField(value.sequence) &&
    typeof value.name === "string" &&
    typeof value.type === "string" &&
    programDayTypeSet.has(value.type) &&
    Array.isArray(value.exercises) &&
    value.exercises.every(isTrainingPrescriptionDto)
  );
}

function isTrainingPrescriptionDto(
  value: unknown,
): value is TrainingPrescriptionDto {
  return (
    isRecord(value) &&
    optionalString(value.prescriptionId) &&
    idField(value.exerciseId) &&
    numberField(value.order) &&
    typeof value.setStructure === "string" &&
    numberField(value.targetSets) &&
    optionalNumber(value.targetWeight) &&
    optionalNumber(value.restSeconds) &&
    optionalString(value.tempo) &&
    optionalNumber(value.rpe) &&
    optionalNumber(value.rir) &&
    optionalString(value.groupId) &&
    optionalString(value.groupType) &&
    optionalString(value.notes)
  );
}

function isWorkoutSessionDto(value: unknown): value is WorkoutSessionDto {
  return (
    isRecord(value) &&
    idField(value.id) &&
    idField(value.workspaceId) &&
    idField(value.relationshipId) &&
    idField(value.traineeUserId) &&
    idField(value.programId) &&
    idField(value.programRevisionId) &&
    optionalString(value.dayKey) &&
    numberField(value.daySequence) &&
    idField(value.performedByUserId) &&
    typeof value.status === "string" &&
    workoutStatusSet.has(value.status) &&
    timestamp(value.startedAt) &&
    optionalTimestamp(value.completedAt) &&
    optionalTimestamp(value.traineeEditableUntil) &&
    optionalTimestamp(value.abandonedAt) &&
    optionalString(value.abandonmentReason) &&
    Array.isArray(value.exercises) &&
    value.exercises.every(isWorkoutExerciseDto) &&
    optionalString(value.notes) &&
    versionField(value.version)
  );
}

function isWorkoutExerciseDto(value: unknown): value is WorkoutExerciseDto {
  return (
    isRecord(value) &&
    idField(value.exerciseId) &&
    optionalString(value.exerciseNameSnapshot) &&
    typeof value.workoutExerciseKey === "string" &&
    (value.sets === undefined ||
      (Array.isArray(value.sets) && value.sets.every(isWorkoutActualSetDto)))
  );
}

function isWorkoutActualSetDto(value: unknown): value is WorkoutActualSetDto {
  return (
    isRecord(value) &&
    typeof value.setKey === "string" &&
    optionalNumber(value.weight) &&
    optionalNumber(value.reps) &&
    optionalNumber(value.durationSeconds) &&
    optionalNumber(value.distance) &&
    optionalNumber(value.rpe) &&
    optionalNumber(value.rir) &&
    typeof value.completed === "boolean" &&
    optionalString(value.notes)
  );
}

const programStatusSet = new Set<string>(programStatuses);
const workoutStatusSet = new Set<string>(workoutStatuses);
const programDayTypeSet = new Set<string>(programDayTypes);
const personalRecordTypeSet = new Set<string>(personalRecordTypes);
const personalRecordEventTypeSet = new Set<string>(personalRecordEventTypes);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function numberField(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function optionalNumber(value: unknown): value is number | undefined {
  return value === undefined || numberField(value);
}

function optionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

function versionField(value: unknown): value is number {
  return numberField(value) && Number.isSafeInteger(value) && value >= 0;
}

function idField(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]+$/.test(value);
}

function timestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

function optionalTimestamp(value: unknown): value is string | undefined {
  return value === undefined || timestamp(value);
}
