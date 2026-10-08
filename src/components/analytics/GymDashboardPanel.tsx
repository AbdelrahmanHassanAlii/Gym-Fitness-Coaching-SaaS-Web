import type { GymDashboardDto } from "@/contracts";
import { AnalyticsSeriesTable } from "./AnalyticsSeriesTable";

export function GymDashboardPanel({
  data,
  labels,
  onLoadActivity,
  onLoadAttention,
  onLoadBranches,
}: {
  data: GymDashboardDto;
  labels: Record<string, string>;
  onLoadActivity: (category: string, cursor: string) => void;
  onLoadAttention: (category: string, cursor: string) => void;
  onLoadBranches: (cursor: string) => void;
}) {
  return (
    <section aria-labelledby="gym-dashboard-title">
      <h2 id="gym-dashboard-title">{labels.gym}</h2>
      <AuthoritativeRange
        range={data.window}
        label={labels.range}
        timezone={labels.timezone}
      />
      <AnalyticsSeriesTable
        caption={labels.summary}
        rows={[data.summary]}
        labels={tableLabels(labels)}
      />
      <h3>{labels.branches}</h3>
      <AnalyticsSeriesTable
        caption={labels.branches}
        rows={asRows(data.branchBreakdown.items)}
        labels={tableLabels(labels)}
      />
      {data.branchBreakdown.hasMore && data.branchBreakdown.nextCursor ? (
        <button
          type="button"
          onClick={() => onLoadBranches(data.branchBreakdown.nextCursor!)}
        >
          {labels.loadMore}
        </button>
      ) : null}
      <CategoryPages
        title={labels.attention}
        pages={data.needsAttention}
        labels={labels}
        load={onLoadAttention}
      />
      {data.scope.pureWorkspaceWide && data.recentActivity ? (
        <CategoryPages
          title={labels.activity}
          pages={data.recentActivity}
          labels={labels}
          load={onLoadActivity}
        />
      ) : null}
    </section>
  );
}

export function AuthoritativeRange({
  range,
  label,
  timezone,
}: {
  range: { from: string; to: string; timezone: string };
  label: string;
  timezone: string;
}) {
  return (
    <p>
      <strong>{label}:</strong> {range.from} – {range.to} · {timezone}:{" "}
      {range.timezone}
    </p>
  );
}

function CategoryPages<T>({
  title,
  pages,
  labels,
  load,
}: {
  title: string;
  pages: Partial<
    Record<
      string,
      { items: readonly T[]; hasMore: boolean; nextCursor: string | null }
    >
  >;
  labels: Record<string, string>;
  load: (category: string, cursor: string) => void;
}) {
  return (
    <section>
      <h3>{title}</h3>
      {Object.entries(pages).map(([category, page]) =>
        page ? (
          <div key={category}>
            <h4>{labels[`value_${category}`] ?? category}</h4>
            <AnalyticsSeriesTable
              caption={`${title}: ${labels[`value_${category}`] ?? category}`}
              rows={asRows(page.items)}
              labels={tableLabels(labels)}
            />
            {page.hasMore && page.nextCursor ? (
              <button
                type="button"
                onClick={() => load(category, page.nextCursor!)}
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

function tableLabels(labels: Record<string, string>) {
  return labels;
}
function asRows<T>(rows: readonly T[]): readonly Record<string, unknown>[] {
  return rows as unknown as readonly Record<string, unknown>[];
}
