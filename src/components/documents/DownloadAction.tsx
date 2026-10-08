import type { AccessDecision } from "@/lib/access";

export function DownloadAction({
  decision,
  disabledLabel,
  label,
  loadingLabel,
  onDownload,
  pending,
}: {
  decision: AccessDecision;
  disabledLabel: string;
  label: string;
  loadingLabel: string;
  onDownload: () => void;
  pending: boolean;
}) {
  const disabled = pending || !decision.allowed;
  return (
    <button
      aria-label={label}
      disabled={disabled}
      onClick={onDownload}
      title={decision.allowed ? label : disabledLabel}
      type="button"
    >
      {pending ? loadingLabel : label}
    </button>
  );
}
