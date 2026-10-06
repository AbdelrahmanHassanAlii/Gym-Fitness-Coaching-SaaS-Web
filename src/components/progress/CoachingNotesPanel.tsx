import type { CoachingNoteDto } from "@/contracts";
import type { AccessDecision } from "@/lib/access";
import type { ProgressLabels } from "./ProgressExperience";
import styles from "./progress.module.css";

export function CoachingNotesPanel({
  canArchive,
  canCreate,
  canUpdate,
  category,
  content,
  isLoading,
  labels,
  notes,
  onArchive,
  onCategoryChange,
  onContentChange,
  onCreate,
  onUpdate,
  onVisibilityChange,
  readDecision,
  visibility,
}: {
  canArchive: AccessDecision;
  canCreate: AccessDecision;
  canUpdate: AccessDecision;
  category: string;
  content: string;
  isLoading: boolean;
  labels: ProgressLabels;
  notes: readonly CoachingNoteDto[];
  onArchive: (note: CoachingNoteDto) => void;
  onCategoryChange: (value: string) => void;
  onContentChange: (value: string) => void;
  onCreate: () => void;
  onUpdate: (note: CoachingNoteDto) => void;
  onVisibilityChange: (value: "PRIVATE" | "SHARED_WITH_TRAINEE") => void;
  readDecision: AccessDecision;
  visibility: "PRIVATE" | "SHARED_WITH_TRAINEE";
}) {
  if (!readDecision.allowed) {
    return (
      <section className={styles.statePanel}>
        <p>{labels.errors.denied}</p>
      </section>
    );
  }

  return (
    <section className={styles.panel}>
      <h2>{labels.notes.title}</h2>
      {isLoading ? <p>{labels.loading}</p> : null}
      <form
        className={styles.formGrid}
        onSubmit={(event) => {
          event.preventDefault();
          onCreate();
        }}
      >
        <label>
          <span>{labels.fields.category}</span>
          <input
            onChange={(event) => onCategoryChange(event.target.value)}
            value={category}
          />
        </label>
        <label>
          <span>{labels.fields.visibility}</span>
          <select
            onChange={(event) =>
              onVisibilityChange(
                event.target.value as "PRIVATE" | "SHARED_WITH_TRAINEE",
              )
            }
            value={visibility}
          >
            <option value="PRIVATE">{labels.values.PRIVATE}</option>
            <option value="SHARED_WITH_TRAINEE">
              {labels.values.SHARED_WITH_TRAINEE}
            </option>
          </select>
        </label>
        <label>
          <span>{labels.fields.content}</span>
          <textarea
            onChange={(event) => onContentChange(event.target.value)}
            required
            value={content}
          />
        </label>
        <button disabled={!canCreate.allowed} type="submit">
          {labels.actions.create}
        </button>
      </form>
      <div className={styles.list}>
        {notes.length === 0 ? <p>{labels.empty.notes}</p> : null}
        {notes.map((note) => (
          <article className={styles.item} key={note.id}>
            <strong>{note.category}</strong>
            <p>{note.content}</p>
            <div className={styles.meta}>
              <span>{note.visibility}</span>
              <span>{note.status}</span>
              <span>{note.version}</span>
            </div>
            <div className={styles.actions}>
              <button
                disabled={!canUpdate.allowed || note.status !== "ACTIVE"}
                onClick={() => onUpdate(note)}
                type="button"
              >
                {labels.actions.update}
              </button>
              <button
                disabled={!canArchive.allowed || note.status !== "ACTIVE"}
                onClick={() => onArchive(note)}
                type="button"
              >
                {labels.actions.archive}
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
