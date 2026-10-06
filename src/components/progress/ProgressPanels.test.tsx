/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import type { AccessDecision } from "@/lib/access";
import { messages } from "@/i18n/messages";
import { CheckInsPanel } from "./CheckInsPanel";
import { CoachingNotesPanel } from "./CoachingNotesPanel";
import { DailyAdherencePanel } from "./DailyAdherencePanel";
import { ProgressMeasurementsPanel } from "./ProgressMeasurementsPanel";

const labels = messages.en.progress;
const allowed = {
  allowed: true,
  reason: "allowed",
  requirement: {} as AccessDecision["requirement"],
  status: "allowed",
} as AccessDecision;

describe("progress corrective panel guards", () => {
  test("renders template and check-in detail with localized statuses", () => {
    render(
      <CheckInsPanel
        assignments={[
          {
            active: true,
            id: "assignment_a" as never,
            recurrence: {
              dayOfWeek: 1,
              frequency: "WEEKLY",
              timezone: "Africa/Cairo",
            },
            relationshipId: "relationship_a" as never,
            startedAt: "2026-05-01T00:00:00.000Z",
            templateId: "template_a" as never,
            version: 1,
            workspaceId: "workspace_a" as never,
          },
        ]}
        canArchiveTemplate={allowed}
        canAssign={allowed}
        canCreateTemplate={allowed}
        canEndAssignment={allowed}
        canReview={allowed}
        canUpdateAssignment={allowed}
        canUpdateTemplate={allowed}
        checkInDetail={{
          assignmentId: "assignment_a" as never,
          dayOfWeek: 1,
          dueAt: "2026-05-08T00:00:00.000Z",
          id: "checkin_a" as never,
          opensAt: "2026-05-01T00:00:00.000Z",
          periodEndAt: "2026-05-08T00:00:00.000Z",
          periodKey: "2026-W18",
          periodStartAt: "2026-05-01T00:00:00.000Z",
          relationshipId: "relationship_a" as never,
          responses: [{ fieldKey: "weekly_notes", value: "Ready" }],
          status: "SUBMITTED",
          templateId: "template_a" as never,
          templateRevisionId: "revision_a" as never,
          timezone: "Africa/Cairo",
          version: 2,
          workspaceId: "workspace_a" as never,
        }}
        checkins={[]}
        firstAssignment={null}
        firstTemplate={null}
        isLoading={false}
        labels={labels}
        onArchiveTemplate={vi.fn()}
        onCreateAssignment={vi.fn()}
        onCreateTemplate={vi.fn()}
        onEndAssignment={vi.fn()}
        onReview={vi.fn()}
        onReviewCommentChange={vi.fn()}
        onReviseTemplate={vi.fn()}
        onSelectCheckIn={vi.fn()}
        onSelectTemplate={vi.fn()}
        onTemplateNameChange={vi.fn()}
        onUpdateAssignment={vi.fn()}
        pendingAssignmentCreate={false}
        pendingAssignmentEndId={null}
        pendingAssignmentUpdateId={null}
        pendingReviewId={null}
        pendingTemplateArchiveId={null}
        pendingTemplateCreate={false}
        pendingTemplateRevisionId={null}
        readAssignmentsDecision={allowed}
        readCheckInsDecision={allowed}
        readTemplatesDecision={allowed}
        reviewComment="looks good"
        reviewableCheckIn={null}
        selectedCheckInId={"checkin_a" as never}
        selectedTemplateId={"template_a" as never}
        templateDetail={{
          revision: {
            fields: [
              {
                fieldKey: "weekly_notes",
                label: "Weekly notes",
                required: false,
                type: "LONG_TEXT",
              },
            ],
            id: "revision_a" as never,
            revision: 1,
            templateId: "template_a" as never,
          },
          template: {
            currentRevisionId: "revision_a" as never,
            id: "template_a" as never,
            name: "Weekly check-in",
            ownerMembershipId: "membership_a" as never,
            status: "ACTIVE",
            version: 1,
            workspaceId: "workspace_a" as never,
          },
        }}
        templateName=""
        templates={[]}
      />,
    );

    expect(screen.getByText("Template detail")).toBeInTheDocument();
    expect(screen.getByText("Check-in detail")).toBeInTheDocument();
    expect(screen.getAllByText("Active").length).toBeGreaterThan(0);
    expect(screen.getByText("Submitted")).toBeInTheDocument();
    expect(
      screen.getAllByText(
        (_content, element) =>
          element?.textContent === "Weekly notes · Long text",
      ).length,
    ).toBeGreaterThan(0);
  });

  test("pending guards disable representative duplicate submits", () => {
    const onCreateMeasurement = vi.fn();
    render(
      <ProgressMeasurementsPanel
        canCreate={allowed}
        canUpdate={allowed}
        isLoading={false}
        labels={labels}
        measurementNotes=""
        measurementValue="91"
        measurements={[]}
        metrics={[
          {
            category: "BODY",
            id: "metric_weight" as never,
            name: "Weight",
            scope: "GYM",
            status: "ACTIVE",
            unit: "kg",
            valueType: "NUMBER",
            version: 1,
            workspaceId: "workspace_a" as never,
          },
        ]}
        onCreate={onCreateMeasurement}
        onMeasurementNotesChange={vi.fn()}
        onMeasurementValueChange={vi.fn()}
        onUpdate={vi.fn()}
        pendingCreate={true}
        pendingUpdate={false}
        readDecision={allowed}
      />,
    );

    fireEvent.click(screen.getByText("Create"));
    expect(onCreateMeasurement).not.toHaveBeenCalled();
  });

  test("non-idempotent pending controls are disabled", () => {
    render(
      <CoachingNotesPanel
        canArchive={allowed}
        canCreate={allowed}
        canUpdate={allowed}
        category="COACHING"
        content="note"
        isLoading={false}
        labels={labels}
        notes={[]}
        onArchive={vi.fn()}
        onCategoryChange={vi.fn()}
        onContentChange={vi.fn()}
        onCreate={vi.fn()}
        onUpdate={vi.fn()}
        onVisibilityChange={vi.fn()}
        pendingArchiveId={null}
        pendingCreate={true}
        pendingUpdateId={null}
        readDecision={allowed}
        visibility="PRIVATE"
      />,
    );
    expect(screen.getByText("Create")).toBeDisabled();
  });

  test("daily pending controls are disabled independently", () => {
    render(
      <DailyAdherencePanel
        config={null}
        daily={null}
        dailyNutrition=""
        dailyReason=""
        dailySteps=""
        dailyWater=""
        isHistorical={false}
        isLoading={false}
        labels={labels}
        localDate="2026-05-01"
        onConfigSave={vi.fn()}
        onDailyNutritionChange={vi.fn()}
        onDailyReasonChange={vi.fn()}
        onDailySave={vi.fn()}
        onDailyStepsChange={vi.fn()}
        onDailyWaterChange={vi.fn()}
        pendingConfig={true}
        pendingDaily={true}
        readDecision={allowed}
        saveConfigDecision={allowed}
        saveDailyDecision={allowed}
      />,
    );
    expect(screen.getAllByText("Save")[0]).toBeDisabled();
    expect(screen.getAllByText("Save")[1]).toBeDisabled();
  });
});
