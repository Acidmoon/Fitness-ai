type StatusTone = "default" | "success" | "muted" | "warning";

interface StatusBadgeProps {
  label: string;
  tone?: StatusTone;
}

export function StatusBadge({
  label,
  tone = "default",
}: StatusBadgeProps) {
  const className =
    tone === "success"
      ? "status-pill status-pill-success"
      : tone === "muted"
        ? "status-pill status-pill-muted"
        : tone === "warning"
          ? "status-pill status-pill-warning"
          : "status-pill";

  return <span className={className}>{label}</span>;
}
