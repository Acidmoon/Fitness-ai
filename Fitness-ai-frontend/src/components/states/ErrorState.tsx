interface ErrorStateProps {
  title?: string;
  message: string;
}

export function ErrorState({ title = "加载失败", message }: ErrorStateProps) {
  return (
    <section className="panel danger-panel state-panel">
      <p className="eyebrow">{title}</p>
      <h3>{message}</h3>
    </section>
  );
}
