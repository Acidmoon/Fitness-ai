export interface Exercise {
  id: number;
  name: string;
  category: string | null;
  description: string | null;
  aliases?: string[];
  body_part?: string | null;
  equipment?: string | null;
  target?: string | null;
  muscle_group?: string | null;
  secondary_muscles?: string[];
  instructions?: Record<string, string>;
  instruction_steps?: Record<string, string[]>;
  analysis_supported?: boolean;
  canonical_action_key?: string | null;
  analysis_rule_version?: string | null;
  analysis_status_reason?: string | null;
  is_bodyweight?: boolean;
  is_low_equipment_candidate?: boolean;
  campus_candidate_reason?: string | null;
  target_muscles?: string[];
  media_attribution?: string | null;
  source?: string | null;
  external_id?: string | null;
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
