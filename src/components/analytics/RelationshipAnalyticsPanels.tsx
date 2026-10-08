import type {
  AdherenceAnalyticsDto,
  NutritionAnalyticsDto,
  ProgressAnalyticsDto,
  TrainingAnalyticsDto,
} from "@/contracts";
import { AnalyticsSeriesTable } from "./AnalyticsSeriesTable";
import { AuthoritativeRange } from "./GymDashboardPanel";

export function RelationshipAnalyticsPanel({
  title,
  data,
  labels,
}: {
  title: string;
  data:
    | TrainingAnalyticsDto
    | ProgressAnalyticsDto
    | NutritionAnalyticsDto
    | AdherenceAnalyticsDto;
  labels: Record<string, string>;
}) {
  const rows = "points" in data ? data.points : data.series;
  return (
    <section>
      <h2>{title}</h2>
      <AuthoritativeRange
        range={data.range}
        label={labels.range}
        timezone={labels.timezone}
      />
      <AnalyticsSeriesTable
        caption={`${title}: ${labels.series}`}
        rows={rows as readonly Record<string, unknown>[]}
        labels={labels}
      />
    </section>
  );
}
