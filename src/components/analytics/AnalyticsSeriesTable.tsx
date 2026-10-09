export function AnalyticsSeriesTable({
  caption,
  rows,
  labels,
}: {
  caption: string;
  rows: readonly Record<string, unknown>[];
  labels: Record<string, string>;
}) {
  if (rows.length === 0) return <p role="status">{labels.empty}</p>;
  return (
    <div role="region" aria-label={caption} tabIndex={0}>
      <table>
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">{labels.period}</th>
            <th scope="col">{labels.value}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${String(row.key ?? row.id ?? index)}`}>
              <th scope="row">
                {formatHeading(row.key ?? row.measuredAt ?? index + 1, labels)}
              </th>
              <td>{displayRow(row, labels)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function displayRow(
  row: Record<string, unknown>,
  labels: Record<string, string>,
) {
  return Object.entries(row)
    .filter(([key]) => !["key", "id", "from", "to", "measuredAt"].includes(key))
    .map(
      ([key, value]) =>
        `${labels[`field_${key}`] ?? key}: ${formatValue(value, labels)}`,
    )
    .join(" · ");
}

function formatValue(value: unknown, labels: Record<string, string>): string {
  if (value === null) return "—";
  if (typeof value === "number")
    return new Intl.NumberFormat(labels.localeTag ?? "en").format(value);
  if (typeof value === "string") return labels[`value_${value}`] ?? value;
  if (typeof value === "boolean")
    return value ? (labels.yes ?? "Yes") : (labels.no ?? "No");
  if (typeof value === "object")
    return Object.entries(value as Record<string, unknown>)
      .map(
        ([key, item]) =>
          `${labels[`field_${key}`] ?? key}: ${formatValue(item, labels)}`,
      )
      .join(", ");
  return "—";
}

function formatHeading(value: unknown, labels: Record<string, string>) {
  const text = String(value);
  return labels[`value_${text}`] ?? text;
}
