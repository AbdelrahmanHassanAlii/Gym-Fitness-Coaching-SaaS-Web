import type {
  CheckInAssignmentDto,
  CheckInDto,
  CheckInTemplateDetailDto,
  CheckInTemplateDto,
  CheckInTemplateId,
} from "@/contracts";
import type { AccessDecision } from "@/lib/access";
import type { ProgressLabels } from "./ProgressExperience";
import styles from "./progress.module.css";

export function CheckInsPanel({
  assignments,
  canArchiveTemplate,
  canAssign,
  canCreateTemplate,
  canEndAssignment,
  canReview,
  canUpdateAssignment,
  canUpdateTemplate,
  checkInDetail,
  checkins,
  firstTemplate,
  isLoading,
  labels,
  onArchiveTemplate,
  onCreateAssignment,
  onCreateTemplate,
  onEndAssignment,
  onReview,
  onReviewCommentChange,
  onReviseTemplate,
  onSelectCheckIn,
  onSelectTemplate,
  onTemplateNameChange,
  onUpdateAssignment,
  pendingAssignmentCreate,
  pendingAssignmentEndId,
  pendingAssignmentUpdateId,
  pendingReviewId,
  pendingTemplateArchiveId,
  pendingTemplateCreate,
  pendingTemplateRevisionId,
  readAssignmentsDecision,
  readCheckInsDecision,
  readTemplatesDecision,
  reviewComment,
  reviewableCheckIn,
  selectedCheckInId,
  selectedTemplateId,
  templateDetail,
  templateName,
  templates,
}: {
  assignments: readonly CheckInAssignmentDto[];
  canArchiveTemplate: AccessDecision;
  canAssign: AccessDecision;
  canCreateTemplate: AccessDecision;
  canEndAssignment: AccessDecision;
  canReview: AccessDecision;
  canUpdateAssignment: AccessDecision;
  canUpdateTemplate: AccessDecision;
  checkInDetail: CheckInDto | null;
  checkins: readonly CheckInDto[];
  firstAssignment: CheckInAssignmentDto | null;
  firstTemplate: CheckInTemplateDto | null;
  isLoading: boolean;
  labels: ProgressLabels;
  onArchiveTemplate: (template: CheckInTemplateDto) => void;
  onCreateAssignment: (templateId: CheckInTemplateId) => void;
  onCreateTemplate: () => void;
  onEndAssignment: (assignment: CheckInAssignmentDto) => void;
  onReview: (checkin: CheckInDto) => void;
  onReviewCommentChange: (value: string) => void;
  onReviseTemplate: (template: CheckInTemplateDto) => void;
  onSelectCheckIn: (checkinId: CheckInDto["id"]) => void;
  onSelectTemplate: (templateId: CheckInTemplateId) => void;
  onTemplateNameChange: (value: string) => void;
  onUpdateAssignment: (assignment: CheckInAssignmentDto) => void;
  pendingAssignmentCreate: boolean;
  pendingAssignmentEndId: string | null;
  pendingAssignmentUpdateId: string | null;
  pendingReviewId: string | null;
  pendingTemplateArchiveId: string | null;
  pendingTemplateCreate: boolean;
  pendingTemplateRevisionId: string | null;
  readAssignmentsDecision: AccessDecision;
  readCheckInsDecision: AccessDecision;
  readTemplatesDecision: AccessDecision;
  reviewComment: string;
  reviewableCheckIn: CheckInDto | null;
  selectedCheckInId: CheckInDto["id"] | null;
  selectedTemplateId: CheckInTemplateId | null;
  templateDetail: CheckInTemplateDetailDto | null;
  templateName: string;
  templates: readonly CheckInTemplateDto[];
}) {
  return (
    <section className={styles.panel}>
      <h2>{labels.checkins.title}</h2>
      {isLoading ? <p>{labels.loading}</p> : null}
      <div className={styles.split}>
        <section className={styles.statePanel}>
          <h3>{labels.checkins.templates}</h3>
          {readTemplatesDecision.allowed ? (
            <>
              <form
                className={styles.formGrid}
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!canCreateTemplate.allowed || pendingTemplateCreate) {
                    return;
                  }
                  onCreateTemplate();
                }}
              >
                <label>
                  <span>{labels.fields.name}</span>
                  <input
                    onChange={(event) =>
                      onTemplateNameChange(event.target.value)
                    }
                    required
                    value={templateName}
                  />
                </label>
                <button
                  disabled={!canCreateTemplate.allowed || pendingTemplateCreate}
                  type="submit"
                >
                  {labels.actions.create}
                </button>
              </form>
              <ListOrEmpty empty={labels.empty.templates}>
                {templates.map((template) => (
                  <article className={styles.item} key={template.id}>
                    <strong>{template.name}</strong>
                    <span>
                      {labels.values[template.status] ?? template.status}
                    </span>
                    <span>{template.version}</span>
                    <div className={styles.actions}>
                      <button
                        disabled={selectedTemplateId === template.id}
                        onClick={() => onSelectTemplate(template.id)}
                        type="button"
                      >
                        {labels.actions.select}
                      </button>
                      <button
                        disabled={
                          !canUpdateTemplate.allowed ||
                          template.status !== "ACTIVE" ||
                          pendingTemplateRevisionId === template.id
                        }
                        onClick={() => {
                          if (
                            !canUpdateTemplate.allowed ||
                            template.status !== "ACTIVE" ||
                            pendingTemplateRevisionId === template.id
                          ) {
                            return;
                          }
                          onReviseTemplate(template);
                        }}
                        type="button"
                      >
                        {labels.actions.submitRevision}
                      </button>
                      <button
                        disabled={
                          !canArchiveTemplate.allowed ||
                          template.status !== "ACTIVE" ||
                          pendingTemplateArchiveId === template.id
                        }
                        onClick={() => {
                          if (
                            !canArchiveTemplate.allowed ||
                            template.status !== "ACTIVE" ||
                            pendingTemplateArchiveId === template.id
                          ) {
                            return;
                          }
                          onArchiveTemplate(template);
                        }}
                        type="button"
                      >
                        {labels.actions.archive}
                      </button>
                    </div>
                  </article>
                ))}
              </ListOrEmpty>
              {templateDetail ? (
                <article className={styles.detail}>
                  <h4>{labels.checkins.templateDetail}</h4>
                  <strong>{templateDetail.template.name}</strong>
                  <span>
                    {labels.values[templateDetail.template.status] ??
                      templateDetail.template.status}
                  </span>
                  <span>
                    {labels.fields.expectedVersion}:{" "}
                    {templateDetail.template.version}
                  </span>
                  {templateDetail.revision ? (
                    <div className={styles.list}>
                      {templateDetail.revision.fields.map((field) => (
                        <span key={field.fieldKey}>
                          {field.label} ·{" "}
                          {labels.values[field.type] ?? field.type}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </article>
              ) : null}
            </>
          ) : (
            <p>{labels.errors.denied}</p>
          )}
        </section>

        <section className={styles.statePanel}>
          <h3>{labels.checkins.assignments}</h3>
          {readAssignmentsDecision.allowed ? (
            <>
              <button
                disabled={
                  !canAssign.allowed ||
                  firstTemplate === null ||
                  pendingAssignmentCreate
                }
                onClick={() =>
                  firstTemplate &&
                  canAssign.allowed &&
                  !pendingAssignmentCreate &&
                  onCreateAssignment(firstTemplate.id)
                }
                type="button"
              >
                {labels.actions.create}
              </button>
              <ListOrEmpty empty={labels.empty.assignments}>
                {assignments.map((assignment) => (
                  <article className={styles.item} key={assignment.id}>
                    <strong>{assignment.templateId}</strong>
                    <span>
                      {assignment.active
                        ? labels.values.ACTIVE
                        : labels.values.ENDED}
                    </span>
                    <span>{assignment.version}</span>
                    <div className={styles.actions}>
                      <button
                        disabled={
                          !canUpdateAssignment.allowed ||
                          !assignment.active ||
                          pendingAssignmentUpdateId === assignment.id
                        }
                        onClick={() => {
                          if (
                            !canUpdateAssignment.allowed ||
                            !assignment.active ||
                            pendingAssignmentUpdateId === assignment.id
                          ) {
                            return;
                          }
                          onUpdateAssignment(assignment);
                        }}
                        type="button"
                      >
                        {labels.actions.update}
                      </button>
                      <button
                        disabled={
                          !canEndAssignment.allowed ||
                          !assignment.active ||
                          pendingAssignmentEndId === assignment.id
                        }
                        onClick={() => {
                          if (
                            !canEndAssignment.allowed ||
                            !assignment.active ||
                            pendingAssignmentEndId === assignment.id
                          ) {
                            return;
                          }
                          onEndAssignment(assignment);
                        }}
                        type="button"
                      >
                        {labels.actions.end}
                      </button>
                    </div>
                  </article>
                ))}
              </ListOrEmpty>
            </>
          ) : (
            <p>{labels.errors.denied}</p>
          )}
        </section>
      </div>

      <section className={styles.statePanel}>
        <h3>{labels.checkins.instances}</h3>
        {readCheckInsDecision.allowed ? (
          <>
            <form
              className={styles.formGrid}
              onSubmit={(event) => {
                event.preventDefault();
                if (
                  !canReview.allowed ||
                  reviewableCheckIn === null ||
                  reviewableCheckIn.status !== "SUBMITTED" ||
                  pendingReviewId === reviewableCheckIn.id
                ) {
                  return;
                }
                onReview(reviewableCheckIn);
              }}
            >
              <label>
                <span>{labels.fields.comment}</span>
                <input
                  onChange={(event) =>
                    onReviewCommentChange(event.target.value)
                  }
                  required
                  value={reviewComment}
                />
              </label>
              <button
                disabled={
                  !canReview.allowed ||
                  reviewableCheckIn === null ||
                  reviewableCheckIn.status !== "SUBMITTED" ||
                  pendingReviewId === reviewableCheckIn.id
                }
                type="submit"
              >
                {labels.actions.review}
              </button>
            </form>
            <ListOrEmpty empty={labels.empty.checkins}>
              {checkins.map((checkin) => (
                <article className={styles.item} key={checkin.id}>
                  <strong>{checkin.periodKey}</strong>
                  <span>{labels.values[checkin.status] ?? checkin.status}</span>
                  <span>{checkin.version}</span>
                  <button
                    disabled={selectedCheckInId === checkin.id}
                    onClick={() => onSelectCheckIn(checkin.id)}
                    type="button"
                  >
                    {labels.actions.select}
                  </button>
                </article>
              ))}
            </ListOrEmpty>
            {checkInDetail ? (
              <article className={styles.detail}>
                <h4>{labels.checkins.instanceDetail}</h4>
                <strong>{checkInDetail.periodKey}</strong>
                <span>
                  {labels.values[checkInDetail.status] ?? checkInDetail.status}
                </span>
                <span>
                  {labels.fields.expectedVersion}: {checkInDetail.version}
                </span>
                <div className={styles.list}>
                  {checkInDetail.responses.map((response) => (
                    <span key={response.fieldKey}>
                      {response.fieldKey}: {String(response.value ?? "-")}
                    </span>
                  ))}
                </div>
                {checkInDetail.trainerFeedback ? (
                  <p>{checkInDetail.trainerFeedback.comment}</p>
                ) : null}
              </article>
            ) : null}
          </>
        ) : (
          <p>{labels.errors.denied}</p>
        )}
      </section>
    </section>
  );
}

function ListOrEmpty({
  children,
  empty,
}: {
  children: React.ReactNode;
  empty: string;
}) {
  const count = Array.isArray(children) ? children.length : 1;
  return (
    <div className={styles.list}>{count === 0 ? <p>{empty}</p> : children}</div>
  );
}
