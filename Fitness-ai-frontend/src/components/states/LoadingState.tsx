interface LoadingStateProps {
  title?: string;
  message: string;
}

export function LoadingState({ title = "加载中", message }: LoadingStateProps) {
  return (
    <section className="panel state-panel">
      <p className="eyebrow">{title}</p>
      <h3>{message}</h3>
    </section>
  );
}
