interface EmptyStateProps {
  title?: string;
  message: string;
}

export function EmptyState({ title = "暂无数据", message }: EmptyStateProps) {
  return (
    <section className="panel state-panel">
      <p className="eyebrow">{title}</p>
      <h3>{message}</h3>
    </section>
  );
}
