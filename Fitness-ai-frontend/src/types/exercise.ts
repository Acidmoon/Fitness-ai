export interface Exercise {
  id: number;
  name: string;
  category: string | null;
  description: string | null;
}

export interface ExerciseRecord {
  id: number;
  exercise_id: number;
  score: number;
  count: number;
  duration: number;
  heart_rate_avg: number | null;
  video_url: string | null;
  feedback: string | null;
  created_at: string;
}

export interface ExerciseRecordFormValues {
  exercise_id: number;
  score: number;
  count: number;
  duration: number;
  heart_rate_avg?: number | null;
  heart_rate_max?: number | null;
  feedback?: string;
}
