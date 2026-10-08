export function DownloadAction({
  allowed,
  disabledLabel,
  label,
  loadingLabel,
  onDownload,
  pending,
}: {
  allowed: boolean;
  disabledLabel: string;
  label: string;
  loadingLabel: string;
  onDownload: () => void;
  pending: boolean;
}) {
  const disabled = pending || !allowed;
  return (
    <button
      aria-label={label}
      disabled={disabled}
      onClick={onDownload}
      title={allowed ? label : disabledLabel}
      type="button"
    >
      {pending ? loadingLabel : label}
    </button>
  );
}
