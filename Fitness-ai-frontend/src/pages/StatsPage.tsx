import { useQuery } from "@tanstack/react-query";

import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { LoadingState } from "@/components/states/LoadingState";
import {
  getPersonalBest,
  getStatsSummary,
  getWeeklyStats,
} from "@/services/stats-api";

function getBarWidth(value: number, maxValue: number) {
  if (!maxValue) {
    return "0%";
  }

  return `${Math.max((value / maxValue) * 100, 8)}%`;
}

export function StatsPage() {
  const summaryQuery = useQuery({
    queryKey: ["stats", "summary"],
    queryFn: getStatsSummary,
  });
  const weeklyQuery = useQuery({
    queryKey: ["stats", "weekly"],
    queryFn: getWeeklyStats,
  });
  const personalBestQuery = useQuery({
    queryKey: ["stats", "personal-best"],
    queryFn: getPersonalBest,
  });

  if (summaryQuery.isLoading || weeklyQuery.isLoading || personalBestQuery.isLoading) {
    return (
      <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Stats</p>
          <h2>统计分析</h2>
        </div>
      </header>
      <LoadingState message="正在加载统计分析数据..." />
    </section>
  );
}

  if (
    summaryQuery.isError ||
    weeklyQuery.isError ||
    personalBestQuery.isError ||
    !summaryQuery.data
  ) {
    return (
      <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Stats</p>
          <h2>统计分析</h2>
        </div>
      </header>
      <ErrorState message="请确认后端服务已启动，且当前登录态仍然有效。" />
    </section>
  );
}

  const categoryStats = summaryQuery.data.category_stats;
  const weeklyStats = weeklyQuery.data ?? [];
  const personalBest = personalBestQuery.data ?? [];
  const maxWeeklySessions = Math.max(...weeklyStats.map((item) => item.sessions), 0);
  const maxCategoryCount = Math.max(...categoryStats.map((item) => item.count), 0);
  const maxBestScore = Math.max(...personalBest.map((item) => item.best_score), 0);

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Stats</p>
          <h2>统计分析</h2>
        </div>
      </header>
      <div className="card-grid">
        <article className="metric-card">
          <span>总训练次数</span>
          <strong>{summaryQuery.data.exercise_stats.total_sessions}</strong>
        </article>
        <article className="metric-card">
          <span>总完成次数</span>
          <strong>{summaryQuery.data.exercise_stats.total_repetitions}</strong>
        </article>
        <article className="metric-card">
          <span>平均得分</span>
          <strong>{summaryQuery.data.exercise_stats.average_score}</strong>
        </article>
        <article className="metric-card">
          <span>最佳得分</span>
          <strong>{summaryQuery.data.exercise_stats.best_score}</strong>
        </article>
      </div>
      <div className="panel-grid">
        <section className="panel">
          <div className="section-heading">
            <div>
              <h3>最近 7 天训练趋势</h3>
              <p>观察训练频率和均分变化，判断近期节奏是否稳定。</p>
            </div>
            <StatusBadge label="趋势视图" tone="muted" />
          </div>
          {weeklyStats.length ? (
            <div className="bars-list">
              {weeklyStats.map((item) => (
                <div key={item.date} className="bar-row">
                  <div className="bar-row-labels">
                    <span>{item.date}</span>
                    <span>{item.sessions} 次</span>
                  </div>
                  <div className="bar-track">
                    <div
                      className="bar-fill"
                      style={{ width: getBarWidth(item.sessions, maxWeeklySessions) }}
                    />
                  </div>
                  <small className="bar-caption">均分 {item.average_score}</small>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="趋势为空" message="最近 7 天暂无训练数据。" />
          )}
        </section>
        <section className="panel">
          <div className="section-heading">
            <div>
              <h3>分类统计</h3>
              <p>按动作类别看训练分布，判断是否存在结构性偏重。</p>
            </div>
            <StatusBadge label="结构视图" tone="muted" />
          </div>
          {categoryStats.length ? (
            <div className="bars-list">
              {categoryStats.map((item) => (
                <div key={item.category} className="bar-row">
                  <div className="bar-row-labels">
                    <span>{item.category}</span>
                    <span>{item.count} 次</span>
                  </div>
                  <div className="bar-track">
                    <div
                      className="bar-fill secondary-fill"
                      style={{ width: getBarWidth(item.count, maxCategoryCount) }}
                    />
                  </div>
                  <small className="bar-caption">均分 {item.average_score}</small>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="分类统计为空" message="暂无分类统计数据。" />
          )}
        </section>
        <section className="panel">
          <div className="section-heading">
            <div>
              <h3>个人最佳</h3>
              <p>展示每个动作的当前最好成绩与最好次数。</p>
            </div>
            <StatusBadge label="表现排行" tone="warning" />
          </div>
          {personalBest.length ? (
            <div className="bars-list">
              {personalBest.map((item) => (
                <div key={item.exercise_name} className="bar-row">
                  <div className="bar-row-labels">
                    <span>{item.exercise_name}</span>
                    <span>{item.best_score} 分</span>
                  </div>
                  <div className="bar-track">
                    <div
                      className="bar-fill accent-fill"
                      style={{ width: getBarWidth(item.best_score, maxBestScore) }}
                    />
                  </div>
                  <small className="bar-caption">最佳次数 {item.best_count}</small>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="个人最佳为空" message="暂无个人最佳数据。" />
          )}
        </section>
        <section className="panel accent-panel">
          <div className="section-heading">
            <div>
              <h3>分析说明</h3>
              <p>当前优先展示趋势和结构，后续可补更完整的图表和智能解释。</p>
            </div>
            <StatusBadge label="AI 预留" tone="success" />
          </div>
          <p>当前统计页优先强调趋势、结构和个人最佳，不与仪表盘重复排版。</p>
          <p>下一阶段可在这里接入更完整的图表、导出和 AI 趋势解释。</p>
        </section>
      </div>
    </section>
  );
}
