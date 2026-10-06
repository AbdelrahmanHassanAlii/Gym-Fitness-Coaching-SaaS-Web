import type {
  CheckInAssignmentDto,
  CheckInDto,
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
  onTemplateNameChange,
  onUpdateAssignment,
  readAssignmentsDecision,
  readCheckInsDecision,
  readTemplatesDecision,
  reviewComment,
  reviewableCheckIn,
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
  onTemplateNameChange: (value: string) => void;
  onUpdateAssignment: (assignment: CheckInAssignmentDto) => void;
  readAssignmentsDecision: AccessDecision;
  readCheckInsDecision: AccessDecision;
  readTemplatesDecision: AccessDecision;
  reviewComment: string;
  reviewableCheckIn: CheckInDto | null;
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
                <button disabled={!canCreateTemplate.allowed} type="submit">
                  {labels.actions.create}
                </button>
              </form>
              <ListOrEmpty empty={labels.empty.templates}>
                {templates.map((template) => (
                  <article className={styles.item} key={template.id}>
                    <strong>{template.name}</strong>
                    <span>{template.status}</span>
                    <span>{template.version}</span>
                    <div className={styles.actions}>
                      <button
                        disabled={
                          !canUpdateTemplate.allowed ||
                          template.status !== "ACTIVE"
                        }
                        onClick={() => onReviseTemplate(template)}
                        type="button"
                      >
                        {labels.actions.submitRevision}
                      </button>
                      <button
                        disabled={
                          !canArchiveTemplate.allowed ||
                          template.status !== "ACTIVE"
                        }
                        onClick={() => onArchiveTemplate(template)}
                        type="button"
                      >
                        {labels.actions.archive}
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

        <section className={styles.statePanel}>
          <h3>{labels.checkins.assignments}</h3>
          {readAssignmentsDecision.allowed ? (
            <>
              <button
                disabled={!canAssign.allowed || firstTemplate === null}
                onClick={() =>
                  firstTemplate && onCreateAssignment(firstTemplate.id)
                }
                type="button"
              >
                {labels.actions.create}
              </button>
              <ListOrEmpty empty={labels.empty.assignments}>
                {assignments.map((assignment) => (
                  <article className={styles.item} key={assignment.id}>
                    <strong>{assignment.templateId}</strong>
                    <span>{assignment.active ? "ACTIVE" : "ENDED"}</span>
                    <span>{assignment.version}</span>
                    <div className={styles.actions}>
                      <button
                        disabled={
                          !canUpdateAssignment.allowed || !assignment.active
                        }
                        onClick={() => onUpdateAssignment(assignment)}
                        type="button"
                      >
                        {labels.actions.update}
                      </button>
                      <button
                        disabled={
                          !canEndAssignment.allowed || !assignment.active
                        }
                        onClick={() => onEndAssignment(assignment)}
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
                if (reviewableCheckIn) onReview(reviewableCheckIn);
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
                  reviewableCheckIn.status !== "SUBMITTED"
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
                  <span>{checkin.status}</span>
                  <span>{checkin.version}</span>
                </article>
              ))}
            </ListOrEmpty>
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
