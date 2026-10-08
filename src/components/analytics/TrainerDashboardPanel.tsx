import type { TrainerDashboardDto } from "@/contracts";
import { AnalyticsSeriesTable } from "./AnalyticsSeriesTable";
import { AuthoritativeRange } from "./GymDashboardPanel";

export function TrainerDashboardPanel({
  data,
  labels,
  onLoadAttention,
}: {
  data: TrainerDashboardDto;
  labels: Record<string, string>;
  onLoadAttention: (category: string, cursor: string) => void;
}) {
  return (
    <section aria-labelledby="trainer-dashboard-title">
      <h2 id="trainer-dashboard-title">{labels.trainer}</h2>
      <AuthoritativeRange
        range={data.window}
        label={labels.range}
        timezone={labels.timezone}
      />
      <AnalyticsSeriesTable
        caption={labels.summary}
        rows={[data.summary]}
        labels={labels}
      />
      <h3>{labels.attention}</h3>
      {Object.entries(data.needsAttention).map(([category, page]) =>
        page ? (
          <div key={category}>
            <AnalyticsSeriesTable
              caption={labels[`value_${category}`] ?? category}
              rows={page.items as unknown as readonly Record<string, unknown>[]}
              labels={labels}
            />
            {page.hasMore && page.nextCursor ? (
              <button
                type="button"
                onClick={() => onLoadAttention(category, page.nextCursor!)}
              >
                {labels.loadMore}
              </button>
            ) : null}
          </div>
        ) : null,
      )}
    </section>
  );
}
