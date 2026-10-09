import type { RelationshipDashboardDto } from "@/contracts";
import { AnalyticsSeriesTable } from "./AnalyticsSeriesTable";

export function RelationshipDashboardPanel({
  data,
  labels,
}: {
  data: RelationshipDashboardDto;
  labels: Record<string, string>;
}) {
  return (
    <section aria-labelledby="relationship-dashboard-title">
      <h2 id="relationship-dashboard-title">{labels.relationshipDashboard}</h2>
      <p>
        {labels[`value_${data.relationship.status}`] ??
          data.relationship.status}{" "}
        · {data.relationship.homeBranchId ?? "—"}
      </p>
      <AnalyticsSeriesTable
        caption={labels.assignedStaff}
        rows={data.assignedStaff}
        labels={labels}
      />
      <AnalyticsSeriesTable
        caption={labels.sectionAccess}
        rows={[
          { key: labels.training, available: data.access.sections.training },
          { key: labels.nutrition, available: data.access.sections.nutrition },
          { key: labels.progress, available: data.access.sections.progress },
          { key: labels.checkIns, available: data.access.sections.checkIns },
        ]}
        labels={labels}
      />
      {data.access.sections.training ? (
        <Summary
          title={labels.training}
          rows={data.training ? [data.training.summary] : []}
          labels={labels}
        />
      ) : null}
      {data.access.sections.nutrition ? (
        <Summary
          title={labels.nutrition}
          rows={
            data.nutrition
              ? [data.nutrition.nutritionTracking, data.nutrition.waterTracking]
              : []
          }
          labels={labels}
        />
      ) : null}
      {data.access.sections.progress ? (
        <Summary
          title={labels.progress}
          rows={
            data.progress
              ? [{ key: labels.summary, ...data.progress.summary }]
              : []
          }
          labels={labels}
        />
      ) : null}
      {data.access.sections.checkIns ? (
        <Summary
          title={labels.checkIns}
          rows={data.checkIns ? [data.checkIns] : []}
          labels={labels}
        />
      ) : null}
      <Summary
        title={labels.adherence}
        rows={[
          ...(data.adherence.training
            ? [{ key: labels.training, ...data.adherence.training }]
            : []),
          ...(data.adherence.checkIns
            ? [{ key: labels.checkIns, ...data.adherence.checkIns }]
            : []),
          ...(data.adherence.nutrition
            ? [{ key: labels.nutrition, ...data.adherence.nutrition }]
            : []),
          ...(data.adherence.water
            ? [{ key: labels.water, ...data.adherence.water }]
            : []),
        ]}
        labels={labels}
      />
      {Object.entries(data.needsAttention).map(([category, page]) =>
        page ? (
          <Summary
            key={category}
            title={`${labels.attention}: ${labels[`value_${category}`] ?? category}`}
            rows={page.items}
            labels={labels}
          />
        ) : null,
      )}
    </section>
  );
}

function Summary<T>({
  title,
  rows,
  labels,
}: {
  title: string;
  rows: readonly T[];
  labels: Record<string, string>;
}) {
  return (
    <section>
      <h3>{title}</h3>
      <AnalyticsSeriesTable
        caption={title}
        rows={rows as readonly Record<string, unknown>[]}
        labels={labels}
      />
    </section>
  );
}
