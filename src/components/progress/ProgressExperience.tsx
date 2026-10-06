"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AdherenceConfigBodyDto,
  AdherenceMetricKey,
  CheckInAssignmentDto,
  CheckInDto,
  CheckInId,
  CheckInTemplateDto,
  CheckInTemplateId,
  CoachingNoteDto,
  MeasurementBodyDto,
  MeasurementDto,
  MetricDefinitionId,
  MembershipId,
  PermissionKey,
  ProgressDailyTrackingBodyDto,
  RelationshipId,
  UserId,
  WorkspaceId,
} from "@/contracts";
import { createIdempotencyKey, isApiError } from "@/lib/api";
import {
  currentUserEffectiveAccessFacts,
  currentUserEffectiveAccessQueryKey,
  erroredCurrentUserAccessFacts,
  evaluateAccess,
  isAccessVersionConflict,
  requestCurrentUserEffectiveAccessDecisions,
  unresolvedCurrentUserAccessFacts,
  type AccessDecision,
  type AccessFacts,
  type CurrentUserDecisionRequest,
} from "@/lib/access";
import { useAuthSession } from "@/lib/auth";
import {
  archiveCheckInTemplate,
  checkInKeys,
  createCheckInAssignment,
  createCheckInTemplate,
  createCheckInTemplateRevision,
  endCheckInAssignment,
  getCheckIn,
  getCheckInTemplate,
  listCheckInAssignments,
  listCheckIns,
  listCheckInTemplates,
  reviewCheckIn,
  updateCheckInAssignment,
} from "@/lib/checkins";
import {
  createMeasurement,
  createNote,
  getAdherenceAnalytics,
  getAdherenceConfig,
  getDailyTracking,
  getHealthProfile,
  getProgressAnalytics,
  listMeasurements,
  listMetricDefinitions,
  listNotes,
  listProgressPhotos,
  progressKeys,
  putAdherenceConfig,
  putDailyTracking,
  updateMeasurement,
  updateNote,
  archiveNote,
} from "@/lib/progress";
import { listRelationships, relationshipKeys } from "@/lib/relationships";
import type { AuthorizationCacheContext } from "@/lib/server-state";
import { useStaffWorkspaceContext } from "@/lib/staff-shell";
import { CheckInsPanel } from "./CheckInsPanel";
import { CoachingNotesPanel } from "./CoachingNotesPanel";
import { DailyAdherencePanel } from "./DailyAdherencePanel";
import { HealthProfilePanel } from "./HealthProfilePanel";
import { ProgressMeasurementsPanel } from "./ProgressMeasurementsPanel";
import { ProgressPhotosPanel } from "./ProgressPhotosPanel";
import styles from "./progress.module.css";

export type ProgressLabels = {
  actions: Record<
    | "archive"
    | "create"
    | "end"
    | "refresh"
    | "review"
    | "save"
    | "select"
    | "submitRevision"
    | "update",
    string
  >;
  analytics: { adherence: string; progress: string; title: string };
  capped: string;
  checkins: {
    assignments: string;
    instanceDetail: string;
    instances: string;
    templateDetail: string;
    templates: string;
    title: string;
  };
  confirm: Record<"archiveNote" | "archiveTemplate" | "endAssignment", string>;
  empty: Record<
    | "assignments"
    | "checkins"
    | "health"
    | "measurements"
    | "notes"
    | "photos"
    | "relationships"
    | "templates",
    string
  >;
  errors: Record<
    | "accessUnavailable"
    | "ambiguous"
    | "conflict"
    | "denied"
    | "disabledMetric"
    | "malformed"
    | "targetDenied"
    | "unavailable"
    | "validation",
    string
  >;
  fields: Record<
    | "allergies"
    | "category"
    | "comment"
    | "content"
    | "date"
    | "dayOfWeek"
    | "enabledMetrics"
    | "expectedVersion"
    | "health"
    | "metric"
    | "name"
    | "notes"
    | "nutrition"
    | "reason"
    | "relationship"
    | "sensitive"
    | "source"
    | "steps"
    | "template"
    | "timezone"
    | "value"
    | "visibility"
    | "water",
    string
  >;
  health: {
    allergyOnly: string;
    full: string;
    readOnly: string;
    title: string;
  };
  loading: string;
  measurements: { title: string };
  notes: { title: string };
  photos: { metadataOnly: string; title: string };
  tabs: Record<
    "adherence" | "checkins" | "health" | "measurements" | "notes" | "photos",
    string
  >;
  title: string;
  status: Record<
    "conflict" | "historical" | "normal" | "saved" | "unknownOutcome",
    string
  >;
  values: Record<string, string>;
};

type ProgressTab =
  "adherence" | "checkins" | "health" | "measurements" | "notes" | "photos";

type CommandRecord = {
  ambiguous: boolean;
  key: string;
  logicalId: string;
};

type StableCommandBoundary = {
  accessContext: AuthorizationCacheContext;
  membershipId: MembershipId;
  principalId: UserId;
  workspaceId: WorkspaceId;
};

type MeasurementCreateCommand = {
  body: MeasurementBodyDto;
  draftId: string;
  logicalId: string;
  params: { relationshipId: RelationshipId; workspaceId: WorkspaceId };
};

type ConfigCommand = {
  body: AdherenceConfigBodyDto;
  enabledMetrics: AdherenceMetricKey[];
};

type DailyCommand = {
  body: ProgressDailyTrackingBodyDto;
  localDate: string;
};

type MeasurementUpdateCommand = {
  body: { expectedVersion: number; value: number };
  measurement: MeasurementDto;
};

type NoteCreateCommand = {
  body: {
    category: string;
    content: string;
    sensitive: boolean;
    visibility: "PRIVATE" | "SHARED_WITH_TRAINEE";
  };
};

type NoteUpdateCommand = {
  body: { content: string; expectedVersion: number };
  note: CoachingNoteDto;
};

type NoteArchiveCommand = {
  body: { expectedVersion: number };
  note: CoachingNoteDto;
};

type AssignmentUpdateCommand = {
  assignment: CheckInAssignmentDto;
  body: {
    expectedVersion: number;
    recurrence: {
      dayOfWeek: number;
      frequency: "WEEKLY";
      timezone: string;
    };
  };
};

const progressReadPermissions = [
  "metric_definitions.read",
  "measurements.read",
  "adherence.read",
  "progress_photos.read",
  "health.read",
  "health.food_allergies.read",
  "notes.read",
  "analytics.progress.read",
  "analytics.adherence.read",
] as const satisfies readonly PermissionKey[];

const progressActionPermissions = [
  "measurements.create",
  "measurements.update",
  "adherence.configure",
  "adherence.update",
  "adherence.correct",
  "notes.create",
  "notes.update",
  "notes.archive",
] as const satisfies readonly PermissionKey[];

const checkInPermissions = [
  "checkins.templates.read",
  "checkins.templates.create",
  "checkins.templates.update",
  "checkins.templates.archive",
  "checkins.assignments.read",
  "checkins.assign",
  "checkins.assignments.update",
  "checkins.assignments.end",
  "checkins.read",
  "checkins.review",
] as const satisfies readonly PermissionKey[];

const commandRecords = new Map<string, CommandRecord>();
const measurementCreateCommands = new Map<string, MeasurementCreateCommand>();
const maxCommandRecords = 96;

export function ProgressExperience({ labels }: { labels: ProgressLabels }) {
  const { generation } = useAuthSession();
  const { shellContext, workspace } = useStaffWorkspaceContext();

  return (
    <ProgressContent
      key={JSON.stringify([
        generation,
        workspace?.workspaceId,
        workspace?.membershipId,
        workspace?.accessVersion,
        shellContext?.accessContext,
      ])}
      labels={labels}
    />
  );
}

function ProgressContent({ labels }: { labels: ProgressLabels }) {
  const queryClient = useQueryClient();
  const { apiClient, generation, state } = useAuthSession();
  const { accessFacts, shellContext, workspace } = useStaffWorkspaceContext();
  const [selectedRelationshipId, setSelectedRelationshipId] =
    useState<RelationshipId | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] =
    useState<CheckInTemplateId | null>(null);
  const [selectedCheckInId, setSelectedCheckInId] = useState<CheckInId | null>(
    null,
  );
  const [selectedTab, setSelectedTab] = useState<ProgressTab>("measurements");
  const today = workspace
    ? localDateInWorkspaceTimeZone(new Date(), workspace.workspaceTimezone)
    : "";
  const [localDate, setLocalDate] = useState(today);
  const [measurementValue, setMeasurementValue] = useState("");
  const [measurementNotes, setMeasurementNotes] = useState("");
  const [dailyWater, setDailyWater] = useState("");
  const [dailyNutrition, setDailyNutrition] = useState("");
  const [dailySteps, setDailySteps] = useState("");
  const [dailyReason, setDailyReason] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [noteCategory, setNoteCategory] = useState("COACHING");
  const [noteVisibility, setNoteVisibility] = useState<
    "PRIVATE" | "SHARED_WITH_TRAINEE"
  >("PRIVATE");
  const [templateName, setTemplateName] = useState("");
  const [reviewComment, setReviewComment] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const workspaceId = workspace?.workspaceId ?? null;
  const membershipId = workspace?.membershipId;
  const accessContext = shellContext?.accessContext ?? "user";
  const principalId =
    state.status === "authenticated" ? state.user.id : undefined;
  const commandBoundary =
    workspaceId !== null && membershipId !== undefined && principalId
      ? {
          accessContext,
          membershipId,
          principalId,
          workspaceId,
        }
      : null;
  const canQuery = state.status === "authenticated" && workspaceId !== null;
  const relationshipRead = actionDecision({
    accessContext,
    accessFacts,
    generation,
    membershipId,
    permission: "trainees.read",
    workspaceId,
  });

  const progressFacts = useDecisionBatch({
    accessContext,
    enabled: canQuery,
    permissions: progressReadPermissions,
    workspace,
  });
  const progressActionFacts = useDecisionBatch({
    accessContext,
    enabled: canQuery,
    permissions: progressActionPermissions,
    workspace,
  });
  const checkInFacts = useDecisionBatch({
    accessContext,
    enabled: canQuery,
    permissions: checkInPermissions,
    workspace,
  });

  const read = {
    adherence: decisionFrom(progressFacts, "adherence.read", workspaceId),
    adherenceAnalytics: decisionFrom(
      progressFacts,
      "analytics.adherence.read",
      workspaceId,
    ),
    checkinAssignments: decisionFrom(
      checkInFacts,
      "checkins.assignments.read",
      workspaceId,
    ),
    checkins: decisionFrom(checkInFacts, "checkins.read", workspaceId),
    health: decisionFrom(progressFacts, "health.read", workspaceId),
    healthAllergies: decisionFrom(
      progressFacts,
      "health.food_allergies.read",
      workspaceId,
    ),
    measurements: decisionFrom(progressFacts, "measurements.read", workspaceId),
    metrics: decisionFrom(
      progressFacts,
      "metric_definitions.read",
      workspaceId,
    ),
    notes: decisionFrom(progressFacts, "notes.read", workspaceId),
    photos: decisionFrom(progressFacts, "progress_photos.read", workspaceId),
    progressAnalytics: decisionFrom(
      progressFacts,
      "analytics.progress.read",
      workspaceId,
    ),
    templates: decisionFrom(
      checkInFacts,
      "checkins.templates.read",
      workspaceId,
    ),
  };

  const actions = {
    adherenceConfigure: decisionFrom(
      progressActionFacts,
      "adherence.configure",
      workspaceId,
    ),
    adherenceCorrect: decisionFrom(
      progressActionFacts,
      "adherence.correct",
      workspaceId,
    ),
    adherenceUpdate: decisionFrom(
      progressActionFacts,
      "adherence.update",
      workspaceId,
    ),
    assign: decisionFrom(checkInFacts, "checkins.assign", workspaceId),
    assignmentEnd: decisionFrom(
      checkInFacts,
      "checkins.assignments.end",
      workspaceId,
    ),
    assignmentUpdate: decisionFrom(
      checkInFacts,
      "checkins.assignments.update",
      workspaceId,
    ),
    measurementCreate: decisionFrom(
      progressActionFacts,
      "measurements.create",
      workspaceId,
    ),
    measurementUpdate: decisionFrom(
      progressActionFacts,
      "measurements.update",
      workspaceId,
    ),
    noteArchive: decisionFrom(
      progressActionFacts,
      "notes.archive",
      workspaceId,
    ),
    noteCreate: decisionFrom(progressActionFacts, "notes.create", workspaceId),
    noteUpdate: decisionFrom(progressActionFacts, "notes.update", workspaceId),
    review: decisionFrom(checkInFacts, "checkins.review", workspaceId),
    templateArchive: decisionFrom(
      checkInFacts,
      "checkins.templates.archive",
      workspaceId,
    ),
    templateCreate: decisionFrom(
      checkInFacts,
      "checkins.templates.create",
      workspaceId,
    ),
    templateUpdate: decisionFrom(
      checkInFacts,
      "checkins.templates.update",
      workspaceId,
    ),
  };

  const relationshipsQuery = useQuery({
    enabled: canQuery && relationshipRead.allowed,
    queryFn: ({ signal }) =>
      listRelationships(apiClient, workspaceId!, { status: "ACTIVE" }, signal),
    queryKey:
      workspaceId === null
        ? ["progress", "relationships", "none"]
        : relationshipKeys.list(
            workspaceId,
            generation,
            "ACTIVE",
            accessContext,
          ),
    retry: false,
  });
  const relationships = useMemo(
    () => relationshipsQuery.data ?? [],
    [relationshipsQuery.data],
  );
  const activeRelationship =
    relationships.find((item) => item.id === selectedRelationshipId) ??
    relationships[0] ??
    null;
  const relationshipId = activeRelationship?.id ?? null;

  const metricQuery = useQuery({
    enabled: canQuery && membershipId !== undefined && read.metrics.allowed,
    queryFn: ({ signal }) =>
      listMetricDefinitions(apiClient, workspaceId!, signal),
    queryKey:
      workspaceId === null || membershipId === undefined
        ? ["progress", "metrics", "none"]
        : progressKeys.metrics(
            workspaceId,
            membershipId,
            generation,
            accessContext,
          ),
    retry: false,
  });
  const metrics = metricQuery.data?.data ?? [];
  const firstMetric = metrics[0] ?? null;

  const measurementsQuery = useQuery({
    enabled:
      canQuery &&
      membershipId !== undefined &&
      relationshipId !== null &&
      read.measurements.allowed,
    queryFn: ({ signal }) =>
      listMeasurements(apiClient, workspaceId!, relationshipId!, {}, signal),
    queryKey:
      workspaceId === null ||
      membershipId === undefined ||
      relationshipId === null
        ? ["progress", "measurements", "none"]
        : progressKeys.measurements(
            workspaceId,
            membershipId,
            relationshipId,
            generation,
            {},
            accessContext,
          ),
    retry: false,
  });
  const measurements = measurementsQuery.data?.data ?? [];
  const firstMeasurement = measurements[0] ?? null;

  const photosQuery = useQuery({
    enabled:
      canQuery &&
      membershipId !== undefined &&
      relationshipId !== null &&
      read.photos.allowed,
    queryFn: ({ signal }) =>
      listProgressPhotos(
        apiClient,
        workspaceId!,
        relationshipId!,
        undefined,
        signal,
      ),
    queryKey:
      workspaceId === null ||
      membershipId === undefined ||
      relationshipId === null
        ? ["progress", "photos", "none"]
        : progressKeys.photos(
            workspaceId,
            membershipId,
            relationshipId,
            generation,
            undefined,
            accessContext,
          ),
    retry: false,
  });

  const healthQuery = useQuery({
    enabled:
      canQuery &&
      membershipId !== undefined &&
      relationshipId !== null &&
      (read.health.allowed || read.healthAllergies.allowed),
    queryFn: ({ signal }) =>
      getHealthProfile(apiClient, workspaceId!, relationshipId!, signal),
    queryKey:
      workspaceId === null ||
      membershipId === undefined ||
      relationshipId === null
        ? ["progress", "health", "none"]
        : progressKeys.health(
            workspaceId,
            membershipId,
            relationshipId,
            generation,
            accessContext,
          ),
    retry: false,
  });

  const notesQuery = useQuery({
    enabled:
      canQuery &&
      membershipId !== undefined &&
      relationshipId !== null &&
      read.notes.allowed,
    queryFn: ({ signal }) =>
      listNotes(apiClient, workspaceId!, relationshipId!, undefined, signal),
    queryKey:
      workspaceId === null ||
      membershipId === undefined ||
      relationshipId === null
        ? ["progress", "notes", "none"]
        : progressKeys.notes(
            workspaceId,
            membershipId,
            relationshipId,
            generation,
            undefined,
            accessContext,
          ),
    retry: false,
  });
  const notes = notesQuery.data?.data ?? [];

  const adherenceConfigQuery = useQuery({
    enabled:
      canQuery &&
      membershipId !== undefined &&
      relationshipId !== null &&
      read.adherence.allowed,
    queryFn: ({ signal }) =>
      getAdherenceConfig(apiClient, workspaceId!, relationshipId!, signal),
    queryKey:
      workspaceId === null ||
      membershipId === undefined ||
      relationshipId === null
        ? ["progress", "adherence-config", "none"]
        : progressKeys.adherenceConfig(
            workspaceId,
            membershipId,
            relationshipId,
            generation,
            accessContext,
          ),
    retry: false,
  });
  const dailyTrackingQuery = useQuery({
    enabled:
      canQuery &&
      membershipId !== undefined &&
      relationshipId !== null &&
      localDate.length > 0 &&
      read.adherence.allowed,
    queryFn: ({ signal }) =>
      getDailyTracking(
        apiClient,
        workspaceId!,
        relationshipId!,
        localDate,
        signal,
      ),
    queryKey:
      workspaceId === null ||
      membershipId === undefined ||
      relationshipId === null
        ? ["progress", "daily-tracking", "none"]
        : progressKeys.dailyTracking(
            workspaceId,
            membershipId,
            relationshipId,
            localDate,
            generation,
            accessContext,
          ),
    retry: false,
  });

  const progressAnalyticsQuery = useQuery({
    enabled:
      canQuery &&
      membershipId !== undefined &&
      relationshipId !== null &&
      firstMetric !== null &&
      read.progressAnalytics.allowed,
    queryFn: ({ signal }) =>
      getProgressAnalytics(
        apiClient,
        workspaceId!,
        relationshipId!,
        {
          from: previousLocalDate(today, 27),
          metricDefinitionId: firstMetric!.id,
          to: today,
        },
        signal,
      ),
    queryKey:
      workspaceId === null ||
      membershipId === undefined ||
      relationshipId === null ||
      firstMetric === null
        ? ["progress", "analytics", "none"]
        : progressKeys.progressAnalytics(
            workspaceId,
            membershipId,
            relationshipId,
            generation,
            {
              from: previousLocalDate(today, 27),
              metricDefinitionId: firstMetric.id,
              to: today,
            },
            accessContext,
          ),
    retry: false,
  });
  const adherenceAnalyticsQuery = useQuery({
    enabled:
      canQuery &&
      membershipId !== undefined &&
      relationshipId !== null &&
      read.adherenceAnalytics.allowed,
    queryFn: ({ signal }) =>
      getAdherenceAnalytics(
        apiClient,
        workspaceId!,
        relationshipId!,
        { from: previousLocalDate(today, 27), granularity: "day", to: today },
        signal,
      ),
    queryKey:
      workspaceId === null ||
      membershipId === undefined ||
      relationshipId === null
        ? ["progress", "adherence-analytics", "none"]
        : progressKeys.adherenceAnalytics(
            workspaceId,
            membershipId,
            relationshipId,
            generation,
            {
              from: previousLocalDate(today, 27),
              granularity: "day",
              to: today,
            },
            accessContext,
          ),
    retry: false,
  });

  const templatesQuery = useQuery({
    enabled: canQuery && membershipId !== undefined && read.templates.allowed,
    queryFn: ({ signal }) =>
      listCheckInTemplates(apiClient, workspaceId!, undefined, signal),
    queryKey:
      workspaceId === null || membershipId === undefined
        ? ["progress", "checkin-templates", "none"]
        : checkInKeys.templates(
            workspaceId,
            membershipId,
            generation,
            undefined,
            accessContext,
          ),
    retry: false,
  });
  const templates = templatesQuery.data?.data ?? [];
  const firstTemplate = templates[0] ?? null;
  const activeTemplateId = selectedTemplateId ?? firstTemplate?.id ?? null;
  const templateDetailQuery = useQuery({
    enabled:
      canQuery &&
      membershipId !== undefined &&
      activeTemplateId !== null &&
      read.templates.allowed,
    queryFn: ({ signal }) =>
      getCheckInTemplate(apiClient, workspaceId!, activeTemplateId!, signal),
    queryKey:
      workspaceId === null ||
      membershipId === undefined ||
      activeTemplateId === null
        ? ["progress", "checkin-template", "none"]
        : checkInKeys.template(
            workspaceId,
            membershipId,
            activeTemplateId,
            generation,
            accessContext,
          ),
    retry: false,
  });
  const templateDetail =
    templateDetailQuery.data?.template.id === activeTemplateId
      ? templateDetailQuery.data
      : null;

  const assignmentsQuery = useQuery({
    enabled:
      canQuery &&
      membershipId !== undefined &&
      relationshipId !== null &&
      read.checkinAssignments.allowed,
    queryFn: ({ signal }) =>
      listCheckInAssignments(
        apiClient,
        workspaceId!,
        relationshipId!,
        undefined,
        signal,
      ),
    queryKey:
      workspaceId === null ||
      membershipId === undefined ||
      relationshipId === null
        ? ["progress", "checkin-assignments", "none"]
        : checkInKeys.assignments(
            workspaceId,
            membershipId,
            relationshipId,
            generation,
            undefined,
            accessContext,
          ),
    retry: false,
  });
  const assignments = assignmentsQuery.data?.data ?? [];
  const firstAssignment = assignments[0] ?? null;

  const checkInsQuery = useQuery({
    enabled:
      canQuery &&
      membershipId !== undefined &&
      relationshipId !== null &&
      read.checkins.allowed,
    queryFn: ({ signal }) =>
      listCheckIns(apiClient, workspaceId!, relationshipId!, undefined, signal),
    queryKey:
      workspaceId === null ||
      membershipId === undefined ||
      relationshipId === null
        ? ["progress", "checkins", "none"]
        : checkInKeys.checkins(
            workspaceId,
            membershipId,
            relationshipId,
            generation,
            undefined,
            accessContext,
          ),
    retry: false,
  });
  const checkIns = checkInsQuery.data?.data ?? [];
  const activeCheckInId = selectedCheckInId ?? checkIns[0]?.id ?? null;
  const checkInDetailQuery = useQuery({
    enabled:
      canQuery &&
      membershipId !== undefined &&
      relationshipId !== null &&
      activeCheckInId !== null &&
      read.checkins.allowed,
    queryFn: ({ signal }) =>
      getCheckIn(
        apiClient,
        workspaceId!,
        relationshipId!,
        activeCheckInId!,
        signal,
      ),
    queryKey:
      workspaceId === null ||
      membershipId === undefined ||
      relationshipId === null ||
      activeCheckInId === null
        ? ["progress", "checkin-detail", "none"]
        : checkInKeys.checkin(
            workspaceId,
            membershipId,
            relationshipId,
            activeCheckInId,
            generation,
            accessContext,
          ),
    retry: false,
  });
  const checkInDetail =
    checkInDetailQuery.data?.id === activeCheckInId
      ? checkInDetailQuery.data
      : null;
  const reviewableCheckIn =
    checkInDetail?.status === "SUBMITTED"
      ? checkInDetail
      : (checkIns.find((item) => item.status === "SUBMITTED") ??
        checkIns[0] ??
        null);

  const invalidateProgress = async () => {
    if (workspaceId) {
      await queryClient.invalidateQueries({
        queryKey: ["workspace", workspaceId],
      });
    }
  };

  const createMeasurementMutation = useMutation<
    MeasurementDto,
    unknown,
    MeasurementCreateCommand
  >({
    mutationFn: async (command) => {
      return withIdempotentCommand(command.logicalId, (key) =>
        createMeasurement(
          apiClient,
          command.params.workspaceId,
          command.params.relationshipId,
          command.body,
          key,
        ),
      );
    },
    onError: async (mutationError, command) => {
      const ambiguous = await ambiguousMutationSideEffects(
        mutationError,
        invalidateProgress,
      );
      if (!ambiguous && !isIdempotencyKeyReused(mutationError)) {
        retireMeasurementCreateCommand(command);
      }
      setError(errorMessage(mutationError, labels));
      if (ambiguous) setStatusMessage(labels.errors.ambiguous);
    },
    onSuccess: async (_measurement, command) => {
      await invalidateProgress();
      retireMeasurementCreateCommand(command);
      setMeasurementValue("");
      setMeasurementNotes("");
      setStatusMessage(labels.status.saved);
      setError(null);
    },
    retry: false,
  });

  const updateMeasurementMutation = useMutation({
    mutationFn: (command: MeasurementUpdateCommand) => {
      if (!workspaceId || !relationshipId) {
        throw new Error("missing measurement context");
      }
      return updateMeasurement(
        apiClient,
        workspaceId,
        relationshipId,
        command.measurement.id,
        command.body,
      );
    },
    onError: async (mutationError, command) => {
      const ambiguous = await ambiguousMutationSideEffects(
        mutationError,
        invalidateProgress,
      );
      if (ambiguous) {
        const refreshed = await measurementsQuery.refetch();
        const latest = refreshed.data?.data.find(
          (item) => item.id === command.measurement.id,
        );
        if (latest && measurementUpdateApplied(command, latest)) {
          setStatusMessage(labels.status.saved);
          setError(null);
          return;
        }
        setStatusMessage(labels.errors.ambiguous);
      }
      setError(errorMessage(mutationError, labels));
    },
    onSuccess: async () => {
      await invalidateProgress();
      setStatusMessage(labels.status.saved);
      setError(null);
    },
    retry: false,
  });

  const putConfigMutation = useMutation({
    mutationFn: (command: ConfigCommand) => {
      if (!workspaceId || !relationshipId)
        throw new Error("missing adherence context");
      return putAdherenceConfig(
        apiClient,
        workspaceId,
        relationshipId,
        command.body,
      );
    },
    onError: async (mutationError, command) => {
      const ambiguous = await ambiguousMutationSideEffects(
        mutationError,
        invalidateProgress,
      );
      if (ambiguous) {
        const refreshed = await adherenceConfigQuery.refetch();
        if (
          refreshed.data &&
          sameStringSet(refreshed.data.enabledMetrics, command.enabledMetrics)
        ) {
          setStatusMessage(labels.status.saved);
          setError(null);
          return;
        }
        setStatusMessage(labels.errors.ambiguous);
      }
      setError(errorMessage(mutationError, labels));
    },
    onSuccess: async () => {
      await invalidateProgress();
      setStatusMessage(labels.status.saved);
      setError(null);
    },
    retry: false,
  });

  const putDailyMutation = useMutation({
    mutationFn: (command: DailyCommand) => {
      if (!workspaceId || !relationshipId)
        throw new Error("missing daily context");
      return putDailyTracking(
        apiClient,
        workspaceId,
        relationshipId,
        command.localDate,
        command.body,
      );
    },
    onError: async (mutationError, command) => {
      const ambiguous = await ambiguousMutationSideEffects(
        mutationError,
        invalidateProgress,
      );
      if (ambiguous) {
        const refreshed = await dailyTrackingQuery.refetch();
        if (
          refreshed.data &&
          dailyTrackingApplied(command.body, refreshed.data)
        ) {
          setStatusMessage(labels.status.saved);
          setError(null);
          return;
        }
        setStatusMessage(labels.errors.ambiguous);
      }
      setError(errorMessage(mutationError, labels));
    },
    onSuccess: async () => {
      await invalidateProgress();
      setStatusMessage(labels.status.saved);
      setError(null);
    },
    retry: false,
  });

  const createNoteMutation = useMutation({
    mutationFn: (command: NoteCreateCommand) => {
      if (!workspaceId || !relationshipId)
        throw new Error("missing note context");
      return createNote(apiClient, workspaceId, relationshipId, command.body);
    },
    onError: async (mutationError) => {
      const ambiguous = await ambiguousMutationSideEffects(
        mutationError,
        invalidateProgress,
      );
      setError(errorMessage(mutationError, labels));
      if (ambiguous) setStatusMessage(labels.errors.ambiguous);
    },
    onSuccess: async () => {
      await invalidateProgress();
      setNoteContent("");
      setStatusMessage(labels.status.saved);
      setError(null);
    },
    retry: false,
  });

  const updateNoteMutation = useMutation({
    mutationFn: (command: NoteUpdateCommand) =>
      updateNote(
        apiClient,
        workspaceId!,
        relationshipId!,
        command.note.id,
        command.body,
      ),
    onError: async (mutationError, command) => {
      const ambiguous = await ambiguousMutationSideEffects(
        mutationError,
        invalidateProgress,
      );
      if (ambiguous) {
        const refreshed = await notesQuery.refetch();
        const latest = refreshed.data?.data.find(
          (item) => item.id === command.note.id,
        );
        if (latest && noteUpdateApplied(command, latest)) {
          setStatusMessage(labels.status.saved);
          setError(null);
          return;
        }
        setStatusMessage(labels.errors.ambiguous);
      }
      setError(errorMessage(mutationError, labels));
    },
    onSuccess: async () => {
      await invalidateProgress();
      setStatusMessage(labels.status.saved);
      setError(null);
    },
    retry: false,
  });

  const archiveNoteMutation = useMutation({
    mutationFn: (command: NoteArchiveCommand) =>
      archiveNote(
        apiClient,
        workspaceId!,
        relationshipId!,
        command.note.id,
        command.body,
      ),
    onError: async (mutationError, command) => {
      const ambiguous = await ambiguousMutationSideEffects(
        mutationError,
        invalidateProgress,
      );
      if (ambiguous) {
        const refreshed = await notesQuery.refetch();
        const latest = refreshed.data?.data.find(
          (item) => item.id === command.note.id,
        );
        if (latest && noteArchiveApplied(command, latest)) {
          setStatusMessage(labels.status.saved);
          setError(null);
          return;
        }
        setStatusMessage(labels.errors.ambiguous);
      }
      setError(errorMessage(mutationError, labels));
    },
    onSuccess: async () => {
      await invalidateProgress();
      setStatusMessage(labels.status.saved);
      setError(null);
    },
    retry: false,
  });

  const createTemplateMutation = useMutation({
    mutationFn: () => {
      if (!commandBoundary) throw new Error("missing command boundary");
      const body = {
        fields: [
          {
            fieldKey: "weekly_notes",
            label: labels.fields.notes,
            required: false,
            type: "LONG_TEXT" as const,
          },
        ],
        name: templateName,
      };
      const logicalId = commandLogicalId({
        body,
        boundary: commandBoundary,
        params: { workspaceId },
        route: "POST /checkin-templates",
      });
      return withIdempotentCommand(logicalId, (key) =>
        createCheckInTemplate(apiClient, workspaceId!, body, key),
      );
    },
    onError: async (mutationError) => {
      const ambiguous = await ambiguousMutationSideEffects(
        mutationError,
        invalidateProgress,
      );
      setError(errorMessage(mutationError, labels));
      if (ambiguous) setStatusMessage(labels.errors.ambiguous);
    },
    onSuccess: async () => {
      await invalidateProgress();
      setTemplateName("");
      setStatusMessage(labels.status.saved);
      setError(null);
    },
    retry: false,
  });

  const reviseTemplateMutation = useMutation({
    mutationFn: (template: CheckInTemplateDto) => {
      if (!commandBoundary) throw new Error("missing command boundary");
      const body = {
        expectedVersion: template.version,
        fields: [
          {
            fieldKey: "weekly_notes",
            label: labels.fields.notes,
            required: false,
            type: "LONG_TEXT" as const,
          },
        ],
      };
      const logicalId = commandLogicalId({
        body,
        boundary: commandBoundary,
        params: { templateId: template.id, workspaceId },
        route: "POST /checkin-templates/:id/revisions",
      });
      return withIdempotentCommand(logicalId, (key) =>
        createCheckInTemplateRevision(
          apiClient,
          workspaceId!,
          template.id,
          body,
          key,
        ),
      );
    },
    onError: async (mutationError) => {
      const ambiguous = await ambiguousMutationSideEffects(
        mutationError,
        invalidateProgress,
      );
      setError(errorMessage(mutationError, labels));
      if (ambiguous) setStatusMessage(labels.errors.ambiguous);
    },
    onSuccess: async () => {
      await invalidateProgress();
      setStatusMessage(labels.status.saved);
      setError(null);
    },
    retry: false,
  });

  const archiveTemplateMutation = useMutation({
    mutationFn: (template: CheckInTemplateDto) => {
      if (!commandBoundary) throw new Error("missing command boundary");
      const body = { expectedVersion: template.version };
      const logicalId = commandLogicalId({
        body,
        boundary: commandBoundary,
        params: { templateId: template.id, workspaceId },
        route: "POST /checkin-templates/:id/archive",
      });
      return withIdempotentCommand(logicalId, (key) =>
        archiveCheckInTemplate(apiClient, workspaceId!, template.id, body, key),
      );
    },
    onError: async (mutationError) => {
      const ambiguous = await ambiguousMutationSideEffects(
        mutationError,
        invalidateProgress,
      );
      setError(errorMessage(mutationError, labels));
      if (ambiguous) setStatusMessage(labels.errors.ambiguous);
    },
    onSuccess: async () => {
      await invalidateProgress();
      setStatusMessage(labels.status.saved);
      setError(null);
    },
    retry: false,
  });

  const createAssignmentMutation = useMutation({
    mutationFn: (templateId: CheckInTemplateId) => {
      if (!relationshipId) throw new Error("missing relationship");
      if (!commandBoundary) throw new Error("missing command boundary");
      const body = {
        recurrence: {
          dayOfWeek: 1,
          frequency: "WEEKLY" as const,
          timezone: workspace!.workspaceTimezone,
        },
        templateId,
      };
      const logicalId = commandLogicalId({
        body,
        boundary: commandBoundary,
        params: { relationshipId, workspaceId },
        route: "POST /checkin-assignments",
      });
      return withIdempotentCommand(logicalId, (key) =>
        createCheckInAssignment(
          apiClient,
          workspaceId!,
          relationshipId,
          body,
          key,
        ),
      );
    },
    onError: async (mutationError) => {
      const ambiguous = await ambiguousMutationSideEffects(
        mutationError,
        invalidateProgress,
      );
      setError(errorMessage(mutationError, labels));
      if (ambiguous) setStatusMessage(labels.errors.ambiguous);
    },
    onSuccess: async () => {
      await invalidateProgress();
      setStatusMessage(labels.status.saved);
      setError(null);
    },
    retry: false,
  });

  const updateAssignmentMutation = useMutation({
    mutationFn: (command: AssignmentUpdateCommand) =>
      updateCheckInAssignment(
        apiClient,
        workspaceId!,
        relationshipId!,
        command.assignment.id,
        command.body,
      ),
    onError: async (mutationError, command) => {
      const ambiguous = await ambiguousMutationSideEffects(
        mutationError,
        invalidateProgress,
      );
      if (ambiguous) {
        const refreshed = await assignmentsQuery.refetch();
        const latest = refreshed.data?.data.find(
          (item) => item.id === command.assignment.id,
        );
        if (latest && assignmentUpdateApplied(command, latest)) {
          setStatusMessage(labels.status.saved);
          setError(null);
          return;
        }
        setStatusMessage(labels.errors.ambiguous);
      }
      setError(errorMessage(mutationError, labels));
    },
    onSuccess: async () => {
      await invalidateProgress();
      setStatusMessage(labels.status.saved);
      setError(null);
    },
    retry: false,
  });

  const endAssignmentMutation = useMutation({
    mutationFn: (assignment: CheckInAssignmentDto) => {
      if (!commandBoundary) throw new Error("missing command boundary");
      const body = { expectedVersion: assignment.version };
      const logicalId = commandLogicalId({
        body,
        boundary: commandBoundary,
        params: { assignmentId: assignment.id, relationshipId, workspaceId },
        route: "POST /checkin-assignments/:id/end",
      });
      return withIdempotentCommand(logicalId, (key) =>
        endCheckInAssignment(
          apiClient,
          workspaceId!,
          relationshipId!,
          assignment.id,
          body,
          key,
        ),
      );
    },
    onError: async (mutationError) => {
      const ambiguous = await ambiguousMutationSideEffects(
        mutationError,
        invalidateProgress,
      );
      setError(errorMessage(mutationError, labels));
      if (ambiguous) setStatusMessage(labels.errors.ambiguous);
    },
    onSuccess: async () => {
      await invalidateProgress();
      setStatusMessage(labels.status.saved);
      setError(null);
    },
    retry: false,
  });

  const reviewCheckInMutation = useMutation({
    mutationFn: (checkin: CheckInDto) => {
      if (!commandBoundary) throw new Error("missing command boundary");
      const body = {
        expectedVersion: checkin.version,
        trainerFeedback: { comment: reviewComment },
      };
      const logicalId = commandLogicalId({
        body,
        boundary: commandBoundary,
        params: { checkinId: checkin.id, relationshipId, workspaceId },
        route: "POST /checkins/:id/review",
      });
      return withIdempotentCommand(logicalId, (key) =>
        reviewCheckIn(
          apiClient,
          workspaceId!,
          relationshipId!,
          checkin.id,
          body,
          key,
        ),
      );
    },
    onError: async (mutationError) => {
      await ambiguousMutationSideEffects(mutationError, invalidateProgress);
      setError(errorMessage(mutationError, labels));
    },
    onSuccess: async () => {
      await invalidateProgress();
      setReviewComment("");
      setStatusMessage(labels.status.saved);
      setError(null);
    },
    retry: false,
  });

  const firstError = firstQueryError(
    [
      relationshipsQuery.error,
      metricQuery.error,
      measurementsQuery.error,
      photosQuery.error,
      healthQuery.error,
      notesQuery.error,
      adherenceConfigQuery.error,
      dailyTrackingQuery.error,
      progressAnalyticsQuery.error,
      adherenceAnalyticsQuery.error,
      templatesQuery.error,
      templateDetailQuery.error,
      assignmentsQuery.error,
      checkInsQuery.error,
      checkInDetailQuery.error,
    ],
    labels,
  );

  if (!workspace) {
    return (
      <section className={styles.statePanel}>
        <h1>{labels.title}</h1>
        <p>{labels.errors.accessUnavailable}</p>
      </section>
    );
  }

  return (
    <section className={styles.shell}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>{workspace.workspaceName}</p>
        <h1>{labels.title}</h1>
        <p className={styles.muted}>{labels.capped}</p>
      </header>

      <div className={styles.toolbar}>
        <label>
          <span>{labels.fields.relationship}</span>
          <select
            disabled={!relationshipRead.allowed || relationships.length === 0}
            onChange={(event) => {
              setSelectedRelationshipId(event.target.value as RelationshipId);
              setSelectedCheckInId(null);
            }}
            value={relationshipId ?? ""}
          >
            {relationships.length === 0 ? (
              <option value="">{labels.empty.relationships}</option>
            ) : null}
            {relationships.map((relationship) => (
              <option key={relationship.id} value={relationship.id}>
                {relationship.id}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{labels.fields.date}</span>
          <input
            onChange={(event) => setLocalDate(event.target.value)}
            type="date"
            value={localDate}
          />
        </label>
        <button
          onClick={() => {
            void invalidateProgress();
          }}
          type="button"
        >
          {labels.actions.refresh}
        </button>
      </div>

      <div className={styles.tabs} role="tablist">
        {(
          [
            "measurements",
            "adherence",
            "health",
            "photos",
            "notes",
            "checkins",
          ] as const
        ).map((tab) => (
          <button
            className={tab === selectedTab ? styles.tabActive : styles.tab}
            key={tab}
            onClick={() => setSelectedTab(tab)}
            role="tab"
            type="button"
          >
            {labels.tabs[tab]}
          </button>
        ))}
      </div>

      {(error ?? firstError) ? (
        <p className={styles.danger} role="alert">
          {error ?? firstError}
        </p>
      ) : null}
      {statusMessage ? (
        <p className={styles.success} role="status">
          {statusMessage}
        </p>
      ) : null}

      {selectedTab === "measurements" ? (
        <ProgressMeasurementsPanel
          analytics={progressAnalyticsQuery.data}
          canCreate={actions.measurementCreate}
          canUpdate={actions.measurementUpdate}
          isLoading={metricQuery.isLoading || measurementsQuery.isLoading}
          labels={labels}
          measurementNotes={measurementNotes}
          measurementValue={measurementValue}
          measurements={measurements}
          metrics={metrics}
          onCreate={() => {
            if (
              createMeasurementMutation.isPending ||
              !firstMetric ||
              !workspaceId ||
              !relationshipId ||
              !commandBoundary
            ) {
              return;
            }
            createMeasurementMutation.mutate(
              prepareMeasurementCreateCommand({
                accessContext,
                membershipId: commandBoundary.membershipId,
                metricDefinitionId: firstMetric.id,
                notes: measurementNotes,
                principalId: commandBoundary.principalId,
                relationshipId,
                value: Number(measurementValue),
                workspaceId,
              }),
            );
          }}
          onMeasurementNotesChange={setMeasurementNotes}
          onMeasurementValueChange={setMeasurementValue}
          onUpdate={() => {
            if (
              updateMeasurementMutation.isPending ||
              !firstMeasurement ||
              !workspaceId ||
              !relationshipId
            ) {
              return;
            }
            updateMeasurementMutation.mutate({
              body: {
                expectedVersion: firstMeasurement.version,
                value: Number(measurementValue),
              },
              measurement: firstMeasurement,
            });
          }}
          pendingCreate={createMeasurementMutation.isPending}
          pendingUpdate={updateMeasurementMutation.isPending}
          readDecision={read.measurements}
        />
      ) : null}

      {selectedTab === "adherence" ? (
        <DailyAdherencePanel
          analytics={adherenceAnalyticsQuery.data}
          config={adherenceConfigQuery.data ?? null}
          daily={dailyTrackingQuery.data ?? null}
          dailyNutrition={dailyNutrition}
          dailyReason={dailyReason}
          dailySteps={dailySteps}
          dailyWater={dailyWater}
          isHistorical={isHistoricalDate(localDate, today)}
          isLoading={
            adherenceConfigQuery.isLoading || dailyTrackingQuery.isLoading
          }
          labels={labels}
          localDate={localDate}
          pendingConfig={putConfigMutation.isPending}
          pendingDaily={putDailyMutation.isPending}
          onConfigSave={(enabledMetrics) => {
            if (putConfigMutation.isPending) return;
            putConfigMutation.mutate({
              body: {
                enabledMetrics,
                ...(adherenceConfigQuery.data
                  ? { expectedVersion: adherenceConfigQuery.data.version }
                  : {}),
              },
              enabledMetrics,
            });
          }}
          onDailyNutritionChange={setDailyNutrition}
          onDailyReasonChange={setDailyReason}
          onDailySave={() => {
            const submissionToday = localDateInWorkspaceTimeZone(
              new Date(),
              workspace.workspaceTimezone,
            );
            if (
              isHistoricalDate(localDate, submissionToday) &&
              dailyReason.trim().length === 0
            ) {
              setError(labels.errors.validation);
              setStatusMessage(labels.status.historical);
              return;
            }
            if (putDailyMutation.isPending) return;
            putDailyMutation.mutate({
              body: {
                ...(dailyTrackingQuery.data
                  ? { expectedVersion: dailyTrackingQuery.data.version }
                  : {}),
                ...(isHistoricalDate(localDate, submissionToday)
                  ? { reason: dailyReason }
                  : {}),
                values: {
                  ...(dailyNutrition
                    ? {
                        NUTRITION: {
                          adherencePercent: Number(dailyNutrition),
                        },
                      }
                    : {}),
                  ...(dailySteps
                    ? { STEPS: { count: Number(dailySteps) } }
                    : {}),
                  ...(dailyWater ? { WATER: { ml: Number(dailyWater) } } : {}),
                },
              },
              localDate,
            });
          }}
          onDailyStepsChange={setDailySteps}
          onDailyWaterChange={setDailyWater}
          readDecision={read.adherence}
          saveConfigDecision={actions.adherenceConfigure}
          saveDailyDecision={
            isHistoricalDate(localDate, today)
              ? actions.adherenceCorrect
              : actions.adherenceUpdate
          }
        />
      ) : null}

      {selectedTab === "health" ? (
        <HealthProfilePanel
          allergyOnly={!read.health.allowed && read.healthAllergies.allowed}
          health={healthQuery.data ?? null}
          isLoading={healthQuery.isLoading}
          labels={labels}
          readDecision={
            read.health.allowed ? read.health : read.healthAllergies
          }
        />
      ) : null}

      {selectedTab === "photos" ? (
        <ProgressPhotosPanel
          isLoading={photosQuery.isLoading}
          labels={labels}
          photos={photosQuery.data?.data ?? []}
          readDecision={read.photos}
        />
      ) : null}

      {selectedTab === "notes" ? (
        <CoachingNotesPanel
          canArchive={actions.noteArchive}
          canCreate={actions.noteCreate}
          canUpdate={actions.noteUpdate}
          category={noteCategory}
          content={noteContent}
          isLoading={notesQuery.isLoading}
          labels={labels}
          notes={notes}
          onArchive={(note) => {
            if (archiveNoteMutation.isPending) return;
            if (confirm(labels.confirm.archiveNote))
              archiveNoteMutation.mutate({
                body: { expectedVersion: note.version },
                note,
              });
          }}
          onCategoryChange={setNoteCategory}
          onContentChange={setNoteContent}
          onCreate={() => {
            if (createNoteMutation.isPending) return;
            createNoteMutation.mutate({
              body: {
                category: noteCategory,
                content: noteContent,
                sensitive: noteVisibility === "PRIVATE",
                visibility: noteVisibility,
              },
            });
          }}
          onUpdate={(note) => {
            if (updateNoteMutation.isPending) return;
            updateNoteMutation.mutate({
              body: {
                content: noteContent || note.content,
                expectedVersion: note.version,
              },
              note,
            });
          }}
          onVisibilityChange={setNoteVisibility}
          pendingArchiveId={archiveNoteMutation.variables?.note.id ?? null}
          pendingCreate={createNoteMutation.isPending}
          pendingUpdateId={updateNoteMutation.variables?.note.id ?? null}
          readDecision={read.notes}
          visibility={noteVisibility}
        />
      ) : null}

      {selectedTab === "checkins" ? (
        <CheckInsPanel
          assignments={assignments}
          canAssign={actions.assign}
          canEndAssignment={actions.assignmentEnd}
          canReview={actions.review}
          canUpdateAssignment={actions.assignmentUpdate}
          canArchiveTemplate={actions.templateArchive}
          canCreateTemplate={actions.templateCreate}
          canUpdateTemplate={actions.templateUpdate}
          checkins={checkIns}
          checkInDetail={checkInDetail}
          isLoading={
            templatesQuery.isLoading ||
            assignmentsQuery.isLoading ||
            checkInsQuery.isLoading ||
            templateDetailQuery.isLoading ||
            checkInDetailQuery.isLoading
          }
          labels={labels}
          onArchiveTemplate={(template) => {
            if (archiveTemplateMutation.isPending) return;
            if (confirm(labels.confirm.archiveTemplate)) {
              archiveTemplateMutation.mutate(template);
            }
          }}
          onCreateAssignment={(templateId) => {
            if (createAssignmentMutation.isPending) return;
            createAssignmentMutation.mutate(templateId);
          }}
          onCreateTemplate={() => {
            if (createTemplateMutation.isPending) return;
            createTemplateMutation.mutate();
          }}
          onEndAssignment={(assignment) => {
            if (endAssignmentMutation.isPending) return;
            if (confirm(labels.confirm.endAssignment)) {
              endAssignmentMutation.mutate(assignment);
            }
          }}
          onReview={(checkin) => {
            if (reviewCheckInMutation.isPending) return;
            reviewCheckInMutation.mutate(checkin);
          }}
          onSelectCheckIn={setSelectedCheckInId}
          onSelectTemplate={setSelectedTemplateId}
          onReviseTemplate={(template) => {
            if (reviseTemplateMutation.isPending) return;
            reviseTemplateMutation.mutate(template);
          }}
          onTemplateNameChange={setTemplateName}
          onUpdateAssignment={(assignment) => {
            if (updateAssignmentMutation.isPending) return;
            updateAssignmentMutation.mutate({
              assignment,
              body: {
                expectedVersion: assignment.version,
                recurrence: {
                  dayOfWeek: assignment.recurrence.dayOfWeek,
                  frequency: "WEEKLY",
                  timezone: workspace.workspaceTimezone,
                },
              },
            });
          }}
          readAssignmentsDecision={read.checkinAssignments}
          readCheckInsDecision={read.checkins}
          readTemplatesDecision={read.templates}
          reviewComment={reviewComment}
          selectedCheckInId={activeCheckInId}
          selectedTemplateId={activeTemplateId}
          templateDetail={templateDetail}
          templateName={templateName}
          templates={templates}
          pendingAssignmentCreate={createAssignmentMutation.isPending}
          pendingAssignmentEndId={endAssignmentMutation.variables?.id ?? null}
          pendingAssignmentUpdateId={
            updateAssignmentMutation.variables?.assignment.id ?? null
          }
          pendingReviewId={reviewCheckInMutation.variables?.id ?? null}
          pendingTemplateArchiveId={
            archiveTemplateMutation.variables?.id ?? null
          }
          pendingTemplateCreate={createTemplateMutation.isPending}
          pendingTemplateRevisionId={
            reviseTemplateMutation.variables?.id ?? null
          }
          onReviewCommentChange={setReviewComment}
          reviewableCheckIn={reviewableCheckIn}
          firstTemplate={firstTemplate}
          firstAssignment={firstAssignment}
        />
      ) : null}
    </section>
  );
}

function useDecisionBatch(input: {
  accessContext: AuthorizationCacheContext;
  enabled: boolean;
  permissions: readonly PermissionKey[];
  workspace: ReturnType<typeof useStaffWorkspaceContext>["workspace"];
}): AccessFacts | null {
  const { apiClient, generation } = useAuthSession();
  const queryClient = useQueryClient();
  const requests = useMemo(
    () => input.permissions.map(workspaceRequest),
    [input.permissions],
  );
  const query = useQuery({
    enabled: input.enabled && input.workspace !== null,
    queryFn: ({ signal }) =>
      requestCurrentUserEffectiveAccessDecisions(
        apiClient,
        input.workspace!.workspaceId,
        input.workspace!.membershipId,
        {
          ...(input.workspace!.accessVersion === undefined
            ? {}
            : { expectedAccessVersion: input.workspace!.accessVersion }),
          requests,
        },
        signal,
      ),
    queryKey:
      input.workspace === null
        ? ["progress", "access", "none"]
        : currentUserEffectiveAccessQueryKey({
            accessContext: input.accessContext,
            accessVersion: input.workspace.accessVersion ?? null,
            membershipId: input.workspace.membershipId,
            requests,
            sessionGeneration: generation,
            workspaceId: input.workspace.workspaceId,
          }),
    retry: false,
  });

  if (isAccessVersionConflict(query.error) && input.workspace) {
    void queryClient.invalidateQueries({
      queryKey: ["workspace", input.workspace.workspaceId],
    });
  }

  if (!input.workspace) return null;
  const identity = {
    accessContext: input.accessContext,
    membershipId: input.workspace.membershipId,
    sessionGeneration: generation,
    workspaceId: input.workspace.workspaceId,
  };
  if (query.data && !query.isLoading && !query.isFetching) {
    return currentUserEffectiveAccessFacts({
      data: query.data,
      sessionGeneration: generation,
    });
  }
  if (query.isError) {
    return erroredCurrentUserAccessFacts({ ...identity, error: query.error });
  }
  return unresolvedCurrentUserAccessFacts(identity);
}

function decisionFrom(
  accessFacts: AccessFacts | null,
  permission: PermissionKey,
  workspaceId: WorkspaceId | null,
): AccessDecision {
  return evaluateAccess(accessFacts, {
    accessContext: accessFacts?.accessContext ?? "user",
    context: "WORKSPACE",
    membershipId: accessFacts?.membershipId,
    permission,
    scope: "workspace",
    sessionGeneration: accessFacts?.sessionGeneration ?? 0,
    workspaceId: workspaceId ?? undefined,
  });
}

function actionDecision(input: {
  accessContext: AuthorizationCacheContext;
  accessFacts: AccessFacts | null;
  generation: number;
  membershipId?: MembershipId;
  permission: PermissionKey;
  workspaceId: WorkspaceId | null;
}): AccessDecision {
  return evaluateAccess(input.accessFacts, {
    accessContext: input.accessContext,
    context: "WORKSPACE",
    membershipId: input.membershipId,
    permission: input.permission,
    scope: "workspace",
    sessionGeneration: input.generation,
    workspaceId: input.workspaceId ?? undefined,
  });
}

function workspaceRequest(
  permission: PermissionKey,
): CurrentUserDecisionRequest {
  return { permission, scope: "WORKSPACE" };
}

export function localDateInWorkspaceTimeZone(
  date: Date,
  timeZone: string,
): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(date);
  const value = (type: "day" | "month" | "year") =>
    parts.find((part) => part.type === type)?.value ?? "00";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function previousLocalDate(localDate: string, days = 1): string {
  const parsed = new Date(`${localDate}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() - days);
  const year = parsed.getUTCFullYear();
  const month = String(parsed.getUTCMonth() + 1).padStart(2, "0");
  const day = String(parsed.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isHistoricalDate(localDate: string, today: string): boolean {
  return localDate < previousLocalDate(today);
}

function isHistoricalAtSubmission(
  localDate: string,
  instant: Date,
  timeZone: string,
): boolean {
  return isHistoricalDate(
    localDate,
    localDateInWorkspaceTimeZone(instant, timeZone),
  );
}

export function prepareMeasurementCreateCommand(input: {
  accessContext: AuthorizationCacheContext;
  membershipId: MembershipId;
  metricDefinitionId: MetricDefinitionId;
  notes: string;
  principalId: UserId;
  relationshipId: RelationshipId;
  value: number;
  workspaceId: WorkspaceId;
}): MeasurementCreateCommand {
  const boundary = stableCommandBoundary(input);
  const draft = {
    boundary,
    metricDefinitionId: input.metricDefinitionId,
    notes: input.notes || undefined,
    params: {
      relationshipId: input.relationshipId,
      workspaceId: input.workspaceId,
    },
    source: "TRAINER",
    value: input.value,
  };
  const draftId = stableStringify(draft);
  const existing = measurementCreateCommands.get(draftId);
  if (existing) return existing;
  const body: MeasurementBodyDto = {
    measuredAt: new Date().toISOString(),
    metricDefinitionId: input.metricDefinitionId,
    notes: input.notes || undefined,
    source: "TRAINER",
    value: input.value,
  };
  const command: MeasurementCreateCommand = {
    body,
    draftId,
    logicalId: commandLogicalId({
      body,
      boundary,
      params: {
        relationshipId: input.relationshipId,
        workspaceId: input.workspaceId,
      },
      route: "POST /measurements",
    }),
    params: {
      relationshipId: input.relationshipId,
      workspaceId: input.workspaceId,
    },
  };
  measurementCreateCommands.set(draftId, command);
  return command;
}

function retireMeasurementCreateCommand(command: MeasurementCreateCommand) {
  measurementCreateCommands.delete(command.draftId);
  retireCommandKey(command.logicalId);
}

function commandLogicalId(input: {
  body: unknown;
  boundary: StableCommandBoundary;
  params: unknown;
  route: string;
}): string {
  return stableStringify(input);
}

function stableCommandBoundary(input: {
  accessContext: AuthorizationCacheContext;
  membershipId: MembershipId;
  principalId: UserId;
  workspaceId: WorkspaceId;
}): StableCommandBoundary {
  return {
    accessContext: input.accessContext,
    membershipId: input.membershipId,
    principalId: input.principalId,
    workspaceId: input.workspaceId,
  };
}

function sameStringSet(left: readonly string[], right: readonly string[]) {
  return (
    left.length === right.length && left.every((item) => right.includes(item))
  );
}

function measurementUpdateApplied(
  command: MeasurementUpdateCommand,
  latest: MeasurementDto,
) {
  return (
    latest.version > command.body.expectedVersion &&
    latest.value === command.body.value
  );
}

function dailyTrackingApplied(
  body: ProgressDailyTrackingBodyDto,
  latest: { values: ProgressDailyTrackingBodyDto["values"]; version: number },
) {
  return Object.entries(body.values).every(([metric, value]) => {
    const latestValue = latest.values[metric as keyof typeof latest.values];
    return stableStringify(latestValue) === stableStringify(value);
  });
}

function noteUpdateApplied(
  command: NoteUpdateCommand,
  latest: CoachingNoteDto,
) {
  return (
    latest.version > command.body.expectedVersion &&
    latest.content === command.body.content
  );
}

function noteArchiveApplied(
  command: NoteArchiveCommand,
  latest: CoachingNoteDto,
) {
  return (
    latest.version > command.body.expectedVersion &&
    latest.status === "ARCHIVED"
  );
}

function assignmentUpdateApplied(
  command: AssignmentUpdateCommand,
  latest: CheckInAssignmentDto,
) {
  return (
    latest.version > command.body.expectedVersion &&
    latest.recurrence.dayOfWeek === command.body.recurrence.dayOfWeek &&
    latest.recurrence.frequency === command.body.recurrence.frequency &&
    latest.recurrence.timezone === command.body.recurrence.timezone
  );
}

async function withIdempotentCommand<T>(
  logicalId: string,
  run: (key: string) => Promise<T>,
): Promise<T> {
  const key = commandKey(logicalId);
  try {
    const result = await run(key);
    retireCommandKey(logicalId);
    return result;
  } catch (error) {
    if (isAmbiguous(error) || isIdempotencyKeyReused(error)) {
      markCommandAmbiguous(logicalId);
    } else {
      retireCommandKey(logicalId);
    }
    throw error;
  }
}

function commandKey(logicalId: string): string {
  const existing = commandRecords.get(logicalId);
  if (existing) return existing.key;
  if (commandRecords.size >= maxCommandRecords) {
    const evictable = [...commandRecords.values()].find(
      (command) => !command.ambiguous,
    );
    if (!evictable) throw new Error("command key capacity exhausted");
    commandRecords.delete(evictable.logicalId);
  }
  const created = { ambiguous: false, key: createIdempotencyKey(), logicalId };
  commandRecords.set(logicalId, created);
  return created.key;
}

function markCommandAmbiguous(logicalId: string) {
  const existing = commandRecords.get(logicalId);
  if (existing) existing.ambiguous = true;
}

function retireCommandKey(logicalId: string) {
  commandRecords.delete(logicalId);
}

export const progressCommandRegistryForTests = {
  commandKey,
  logicalId: commandLogicalId,
  markCommandAmbiguous,
  maxCommandRecords,
  reset: () => {
    commandRecords.clear();
    measurementCreateCommands.clear();
  },
  retireCommandKey,
  stableBoundary: stableCommandBoundary,
  comparisons: {
    adherenceConfigApplied: sameStringSet,
    assignmentUpdateApplied,
    dailyTrackingApplied,
    measurementUpdateApplied,
    noteArchiveApplied,
    noteUpdateApplied,
  },
  isHistoricalAtSubmission,
};

async function ambiguousMutationSideEffects(
  error: unknown,
  invalidate: () => Promise<void>,
): Promise<boolean> {
  if (isAmbiguous(error)) {
    await invalidate();
    return true;
  }
  return false;
}

function firstQueryError(
  errors: readonly unknown[],
  labels: ProgressLabels,
): string | null {
  const error = errors.find((item) => item !== null);
  return error === undefined ? null : errorMessage(error, labels);
}

function errorMessage(error: unknown, labels: ProgressLabels): string {
  if (!isApiError(error)) return labels.errors.unavailable;
  if (error.kind === "malformed-response") return labels.errors.malformed;
  if (error.kind === "network") return labels.status.unknownOutcome;
  if (error.kind === "backend") {
    if (error.status === 403) return labels.errors.targetDenied;
    if (error.status === 409) return labels.errors.conflict;
    if (error.code === "DAILY_TRACKING_METRIC_DISABLED") {
      return labels.errors.disabledMetric;
    }
    if (error.status === 422 || error.category === "validation") {
      return labels.errors.validation;
    }
    if ((error.status ?? 0) >= 500) return labels.status.unknownOutcome;
  }
  return labels.errors.unavailable;
}

function isAmbiguous(error: unknown): boolean {
  return (
    isApiError(error) &&
    (error.kind === "network" ||
      (error.kind === "backend" && (error.status ?? 0) >= 500))
  );
}

function isIdempotencyKeyReused(error: unknown): boolean {
  return (
    isApiError(error) &&
    error.kind === "backend" &&
    error.code === "IDEMPOTENCY_KEY_REUSED"
  );
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

export const progressDecisionSetsForTests = {
  checkInPermissions,
  progressActionPermissions,
  progressReadPermissions,
};
