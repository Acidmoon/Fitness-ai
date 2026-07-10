package com.fitnessai.android.data.api

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

@Serializable
data class TokenDto(
    @SerialName("access_token") val accessToken: String,
    @SerialName("token_type") val tokenType: String,
    @SerialName("refresh_token") val refreshToken: String? = null,
)

@Serializable
data class RegisterRequestDto(
    val username: String,
    val password: String,
    val email: String? = null
)

@Serializable
data class UserProfileDto(
    val id: Int,
    val username: String,
    val email: String? = null,
    @SerialName("is_active") val isActive: Boolean = true,
    @SerialName("created_at") val createdAt: String? = null,
    @SerialName("updated_at") val updatedAt: String? = null
)

@Serializable
data class ExerciseDto(
    val id: Int,
    val name: String,
    val category: String? = null,
    val description: String? = null,
    val aliases: List<String> = emptyList(),
    @SerialName("body_part") val bodyPart: String? = null,
    val equipment: String? = null,
    val target: String? = null,
    @SerialName("muscle_group") val muscleGroup: String? = null,
    @SerialName("secondary_muscles") val secondaryMuscles: List<String> = emptyList(),
    val instructions: Map<String, String> = emptyMap(),
    @SerialName("instruction_steps") val instructionSteps: Map<String, List<String>> = emptyMap(),
    @SerialName("analysis_supported") val analysisSupported: Boolean = false,
    @SerialName("canonical_action_key") val canonicalActionKey: String? = null,
    @SerialName("analysis_rule_version") val analysisRuleVersion: String? = null,
    @SerialName("analysis_status_reason") val analysisStatusReason: String? = null,
    @SerialName("is_bodyweight") val isBodyweight: Boolean = false,
    @SerialName("is_low_equipment_candidate") val isLowEquipmentCandidate: Boolean = false,
    @SerialName("campus_candidate_reason") val campusCandidateReason: String? = null,
    @SerialName("target_muscles") val targetMuscles: List<String> = emptyList(),
    @SerialName("media_attribution") val mediaAttribution: String? = null,
    val source: String? = null,
    @SerialName("external_id") val externalId: String? = null
)

@Serializable
data class ExerciseRecordCreateDto(
    @SerialName("exercise_id") val exerciseId: Int,
    val score: Double,
    val count: Int,
    val duration: Int,
    @SerialName("heart_rate_avg") val heartRateAvg: Double? = null,
    @SerialName("heart_rate_max") val heartRateMax: Double? = null
)

@Serializable
data class ExerciseRecordUpdateDto(
    val score: Double? = null,
    val count: Int? = null,
    val duration: Int? = null,
    @SerialName("heart_rate_avg") val heartRateAvg: Double? = null,
    @SerialName("heart_rate_max") val heartRateMax: Double? = null
)

@Serializable
data class ExerciseRecordDto(
    val id: Int,
    @SerialName("exercise_id") val exerciseId: Int,
    val score: Double,
    val count: Int,
    @SerialName("manual_score") val manualScore: Double? = null,
    @SerialName("manual_count") val manualCount: Int? = null,
    @SerialName("score_source") val scoreSource: String = "manual",
    @SerialName("count_source") val countSource: String = "manual",
    val duration: Int,
    @SerialName("heart_rate_avg") val heartRateAvg: Double? = null,
    @SerialName("video_url") val videoUrl: String? = null,
    @SerialName("video_revision") val videoRevision: Int = 0,
    @SerialName("analysis_revision") val analysisRevision: Int? = null,
    @SerialName("analysis_model") val analysisModel: String? = null,
    @SerialName("analysis_rule_version") val analysisRuleVersion: String? = null,
    val feedback: String? = null,
    @SerialName("created_at") val createdAt: String
)

@Serializable
data class ExerciseStatsDto(
    @SerialName("total_sessions") val totalSessions: Int,
    @SerialName("total_repetitions") val totalRepetitions: Int,
    @SerialName("average_score") val averageScore: Double,
    @SerialName("best_score") val bestScore: Double,
    @SerialName("total_duration") val totalDuration: Int
)

@Serializable
data class CategoryStatsDto(
    val category: String,
    val count: Int,
    @SerialName("average_score") val averageScore: Double
)

@Serializable
data class RecentRecordDto(
    val id: Int,
    @SerialName("exercise_name") val exerciseName: String,
    val score: Double,
    val count: Int,
    @SerialName("created_at") val createdAt: String
)

@Serializable
data class StatsSummaryDto(
    @SerialName("exercise_stats") val exerciseStats: ExerciseStatsDto,
    @SerialName("category_stats") val categoryStats: List<CategoryStatsDto> = emptyList(),
    @SerialName("recent_records") val recentRecords: List<RecentRecordDto> = emptyList()
)

@Serializable
data class WeeklyStatsDto(
    val date: String,
    val sessions: Int,
    @SerialName("average_score") val averageScore: Double
)

@Serializable
data class PersonalBestStatsDto(
    @SerialName("exercise_name") val exerciseName: String,
    @SerialName("best_score") val bestScore: Double? = null,
    @SerialName("best_count") val bestCount: Int? = null
)

@Serializable
data class VideoUploadResponseDto(
    val message: String,
    @SerialName("video_url") val videoUrl: String? = null,
    @SerialName("file_size") val fileSize: Long = 0,
    @SerialName("video_deleted") val videoDeleted: Boolean = false,
    val note: String? = null
)

@Serializable
data class PoseAnalysisTriggerDto(
    @SerialName("sample_fps") val sampleFps: Int? = null
)

@Serializable
data class PoseAnalysisModelDto(
    val name: String? = null,
    @SerialName("input_size") val inputSize: Int? = null
)

@Serializable
data class PoseAnalysisSummaryDto(
    @SerialName("total_frames") val totalFrames: Int = 0,
    @SerialName("processed_frames") val processedFrames: Int = 0,
    @SerialName("sampled_frames") val sampledFrames: Int = 0,
    @SerialName("valid_frame_count") val validFrameCount: Int = 0,
    @SerialName("average_confidence") val averageConfidence: Double = 0.0,
    @SerialName("source_fps") val sourceFps: Double? = null,
    @SerialName("sample_fps") val sampleFps: Int = 0
)

@Serializable
data class PoseAnalysisFrameDto(
    @SerialName("frame_index") val frameIndex: Int,
    @SerialName("timestamp_ms") val timestampMs: Int,
    val keypoints: List<JsonObject> = emptyList()
)

@Serializable
data class PoseAnalysisResultDto(
    @SerialName("record_id") val recordId: Int,
    @SerialName("schema_version") val schemaVersion: Int = 1,
    val status: String,
    val model: PoseAnalysisModelDto? = null,
    val summary: PoseAnalysisSummaryDto? = null,
    val frames: List<PoseAnalysisFrameDto> = emptyList(),
    val error: String? = null
)

@Serializable
data class PoseAnalysisJobDto(
    val id: Int,
    @SerialName("record_id") val recordId: Int,
    @SerialName("video_revision") val videoRevision: Int = 0,
    @SerialName("sample_fps") val sampleFps: Int? = null,
    val status: String,
    val error: String? = null,
    @SerialName("result_summary") val resultSummary: JsonObject? = null,
    @SerialName("created_at") val createdAt: String,
    @SerialName("updated_at") val updatedAt: String,
    @SerialName("completed_at") val completedAt: String? = null
)

@Serializable
data class PoseScoringRequestDto(
    val apply: Boolean = false
)

@Serializable
data class PoseScoringResultDto(
    @SerialName("record_id") val recordId: Int,
    val status: String,
    val applied: Boolean = false,
    @SerialName("exercise_type") val exerciseType: String? = null,
    val score: Double? = null,
    val count: Int? = null,
    val confidence: Double? = null,
    val feedback: List<String> = emptyList(),
    val metrics: JsonObject? = null
)
