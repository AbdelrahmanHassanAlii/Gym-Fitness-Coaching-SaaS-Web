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
        caption={labels.summary}
        rows={data.assignedStaff}
        labels={labels}
      />
    </section>
  );
}
