export interface ExerciseStats {
  total_sessions: number;
  total_repetitions: number;
  average_score: number;
  best_score: number;
  total_duration: number;
}

export interface CategoryStats {
  category: string;
  count: number;
  average_score: number;
}

export interface RecentRecord {
  id: number;
  exercise_name: string;
  score: number;
  count: number;
  created_at: string;
}

export interface StatsSummary {
  exercise_stats: ExerciseStats;
  category_stats: CategoryStats[];
  recent_records: RecentRecord[];
}

export interface WeeklyStat {
  date: string;
  sessions: number;
  average_score: number;
}

export interface PersonalBest {
  exercise_name: string;
  best_score: number;
  best_count: number;
}
