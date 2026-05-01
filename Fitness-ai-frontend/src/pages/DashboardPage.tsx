import { useQuery } from "@tanstack/react-query";

import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { LoadingState } from "@/components/states/LoadingState";
import { getStatsSummary, getWeeklyStats } from "@/services/stats-api";

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (!minutes) {
    return `${seconds} 秒`;
  }

  return `${minutes} 分 ${seconds} 秒`;
}

export function DashboardPage() {
  const summaryQuery = useQuery({
    queryKey: ["stats", "summary"],
    queryFn: getStatsSummary,
  });
  const weeklyQuery = useQuery({
    queryKey: ["stats", "weekly"],
    queryFn: getWeeklyStats,
  });

  if (summaryQuery.isLoading || weeklyQuery.isLoading) {
    return (
      <section className="page">
        <header className="page-header">
          <div>
            <p className="eyebrow">Dashboard</p>
            <h2>训练概览</h2>
          </div>
        </header>
        <LoadingState message="正在加载仪表盘数据..." />
      </section>
    );
  }

  if (summaryQuery.isError || weeklyQuery.isError || !summaryQuery.data) {
    return (
      <section className="page">
        <header className="page-header">
          <div>
            <p className="eyebrow">Dashboard</p>
            <h2>训练概览</h2>
          </div>
        </header>
        <ErrorState message="请确认已登录，且后端服务已启动。" />
      </section>
    );
  }

  const stats = summaryQuery.data.exercise_stats;
  const weeklyStats = weeklyQuery.data ?? [];

  return (
    <section className="page">
      <section className="dashboard-hero">
        <div className="dashboard-hero-copy">
          <p className="eyebrow">Training Overview</p>
          <h1>把每一次训练转成可复盘的数据轨迹</h1>
          <p>
            从记录、趋势、分类到视频素材，当前首页优先展示你最近的训练节奏和关键表现。
          </p>
          <div className="inline-actions">
            <StatusBadge label={`${stats.total_sessions} 次训练`} tone="success" />
            <StatusBadge label={`${formatDuration(stats.total_duration)} 总时长`} tone="warning" />
            <StatusBadge label="AI 分析预留中" tone="muted" />
          </div>
        </div>
        <div className="dashboard-hero-panel">
          <span>当前平均得分</span>
          <strong>{stats.average_score}</strong>
          <p>最佳得分 {stats.best_score}，总完成次数 {stats.total_repetitions}</p>
        </div>
      </section>

      <div className="card-grid">
        <article className="metric-card">
          <span>总训练次数</span>
          <strong>{stats.total_sessions}</strong>
        </article>
        <article className="metric-card">
          <span>总完成次数</span>
          <strong>{stats.total_repetitions}</strong>
        </article>
        <article className="metric-card">
          <span>平均得分</span>
          <strong>{stats.average_score}</strong>
        </article>
        <article className="metric-card">
          <span>最佳得分</span>
          <strong>{stats.best_score}</strong>
        </article>
      </div>
      <div className="panel-grid">
        <section className="panel">
          <div className="section-heading">
            <div>
              <h3>最近 7 天趋势</h3>
              <p>快速判断近期训练频率是否稳定、均分是否有波动。</p>
            </div>
            <StatusBadge label="近期趋势" tone="muted" />
          </div>
          {weeklyStats.length ? (
            <ul className="data-list">
              {weeklyStats.map((item) => (
                <li key={item.date} className="data-list-item">
                  <span>{item.date}</span>
                  <strong>{item.sessions} 次</strong>
                  <span>均分 {item.average_score}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="近期趋势为空" message="最近 7 天还没有训练记录。" />
          )}
        </section>
        <section className="panel">
          <div className="section-heading">
            <div>
              <h3>分类统计</h3>
              <p>观察训练分布是否集中在单一类别，帮助你调整结构。</p>
            </div>
            <StatusBadge label="训练结构" tone="muted" />
          </div>
          {summaryQuery.data.category_stats.length ? (
            <ul className="data-list">
              {summaryQuery.data.category_stats.map((item) => (
                <li key={item.category} className="data-list-item">
                  <span>{item.category}</span>
                  <strong>{item.count} 次</strong>
                  <span>均分 {item.average_score}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="分类统计为空" message="暂无分类统计数据。" />
          )}
        </section>
        <section className="panel">
          <div className="section-heading">
            <div>
              <h3>最近记录</h3>
              <p>回看最近一次训练表现，快速进入编辑、视频或详情流程。</p>
            </div>
            <StatusBadge label="最新数据" tone="success" />
          </div>
          {summaryQuery.data.recent_records.length ? (
            <ul className="data-list">
              {summaryQuery.data.recent_records.map((item) => (
                <li key={item.id} className="data-list-item">
                  <span>{item.exercise_name}</span>
                  <strong>{item.score} 分</strong>
                  <span>{item.count} 次</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="最近记录为空" message="暂无最近训练记录。" />
          )}
        </section>
        <section className="panel accent-panel">
          <div className="section-heading">
            <div>
              <h3>下一阶段能力</h3>
              <p>当前首页已完成业务闭环，后续重点挂接 AI 视频分析和结果解释。</p>
            </div>
            <StatusBadge label="Next: AI" tone="success" />
          </div>
          <p>训练总时长：{formatDuration(stats.total_duration)}</p>
          <p>建议下一步把视频分析状态、关键点回放和纠错建议放在这里承接。</p>
        </section>
      </div>
    </section>
  );
}
