package com.fitnessai.android.data.model

import android.net.Uri
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import java.util.UUID

enum class UserRole(val label: String) {
    Student("学生"),
    Teacher("教师"),
    Administrator("管理员"),
    PersonalFitness("个人健身")
}

data class UserSession(
    val userId: String = "mock-user",
    val displayName: String = "内部测试用户",
    val role: UserRole? = null
)

enum class AnalysisStatus {
    Idle,
    Queued,
    Running,
    Completed,
    Failed
}

data class AnalysisResult(
    val status: AnalysisStatus,
    val modelName: String? = null,
    val validFrameCount: Int? = null,
    val averageConfidence: Double? = null,
    val scorePreview: Int? = null,
    val countPreview: Int? = null,
    val message: String? = null
)

data class TrainingRecord(
    val id: String = UUID.randomUUID().toString(),
    val exerciseId: String? = null,
    val exerciseName: String,
    val category: String,
    val count: Int,
    val score: Int? = null,
    val durationSeconds: Int? = null,
    val recordedAt: LocalDateTime = LocalDateTime.now(),
    val videoUri: Uri? = null,
    val analysisResult: AnalysisResult = AnalysisResult(status = AnalysisStatus.Idle)
) {
    val dateLabel: String
        get() = recordedAt.format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm"))

    val hasActiveAnalysis: Boolean
        get() = analysisResult.status == AnalysisStatus.Queued ||
            analysisResult.status == AnalysisStatus.Running
}

data class RecordDraft(
    val exerciseId: String = "",
    val exerciseName: String = "",
    val category: String = "",
    val count: String = "",
    val score: String = "",
    val durationSeconds: String = ""
)

data class ExerciseCatalogItem(
    val id: String,
    val name: String,
    val category: String
)

data class StatsSummary(
    val totalRecords: Int,
    val totalCount: Int,
    val totalDurationSeconds: Int,
    val bestScore: Int?
)

data class WeeklyStatsPoint(
    val date: String,
    val sessions: Int,
    val averageScore: Double
)

data class PersonalBestStats(
    val exerciseName: String,
    val bestScore: Double?,
    val bestCount: Int?
)
