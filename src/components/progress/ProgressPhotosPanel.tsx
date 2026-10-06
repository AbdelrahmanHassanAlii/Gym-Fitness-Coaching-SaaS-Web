import type { ProgressPhotoDto } from "@/contracts";
import type { AccessDecision } from "@/lib/access";
import type { ProgressLabels } from "./ProgressExperience";
import styles from "./progress.module.css";

export function ProgressPhotosPanel({
  isLoading,
  labels,
  photos,
  readDecision,
}: {
  isLoading: boolean;
  labels: ProgressLabels;
  photos: readonly ProgressPhotoDto[];
  readDecision: AccessDecision;
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
      <h2>{labels.photos.title}</h2>
      <p className={styles.muted}>{labels.photos.metadataOnly}</p>
      {isLoading ? <p>{labels.loading}</p> : null}
      <div className={styles.list}>
        {photos.length === 0 ? <p>{labels.empty.photos}</p> : null}
        {photos.map((photo) => (
          <article className={styles.item} key={photo.id}>
            <strong>{photo.capturedAt}</strong>
            <span>{photo.visibility}</span>
            <span>{photo.photos.map((item) => item.type).join(", ")}</span>
          </article>
        ))}
      </div>
    </section>
  );
}
