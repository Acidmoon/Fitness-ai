package com.fitnessai.android.data.api

import com.fitnessai.android.data.model.AnalysisResult
import com.fitnessai.android.data.model.AnalysisStatus
import com.fitnessai.android.data.model.PersonalBestStats
import com.fitnessai.android.data.model.StatsSummary
import com.fitnessai.android.data.model.TrainingRecord
import com.fitnessai.android.data.model.UserSession
import com.fitnessai.android.data.model.WeeklyStatsPoint
import java.time.LocalDateTime
import java.time.OffsetDateTime

fun UserProfileDto.toUserSession(fallbackRole: com.fitnessai.android.data.model.UserRole? = null): UserSession {
    return UserSession(
        userId = id.toString(),
        displayName = username,
        role = fallbackRole
    )
}

fun ExerciseRecordDto.toTrainingRecord(exercise: ExerciseDto? = null): TrainingRecord {
    return TrainingRecord(
        id = id.toString(),
        exerciseName = exercise?.name ?: "动作 #$exerciseId",
        category = exercise?.category ?: "未分类",
        count = count,
        score = score.toInt(),
        durationSeconds = duration,
        recordedAt = parseBackendDateTime(createdAt),
        analysisResult = AnalysisResult(
            status = if (feedback.isNullOrBlank()) AnalysisStatus.Idle else AnalysisStatus.Completed,
            message = feedback
        )
    )
}

fun StatsSummaryDto.toStatsSummary(): StatsSummary {
    return StatsSummary(
        totalRecords = exerciseStats.totalSessions,
        totalCount = exerciseStats.totalRepetitions,
        totalDurationSeconds = exerciseStats.totalDuration,
        bestScore = exerciseStats.bestScore.toInt()
    )
}

fun WeeklyStatsDto.toWeeklyStatsPoint(): WeeklyStatsPoint {
    return WeeklyStatsPoint(
        date = date,
        sessions = sessions,
        averageScore = averageScore
    )
}

fun PersonalBestStatsDto.toPersonalBestStats(): PersonalBestStats {
    return PersonalBestStats(
        exerciseName = exerciseName,
        bestScore = bestScore,
        bestCount = bestCount
    )
}

fun PoseAnalysisResultDto.toAnalysisResult(): AnalysisResult {
    return AnalysisResult(
        status = when (status.lowercase()) {
            "done" -> AnalysisStatus.Completed
            "failed" -> AnalysisStatus.Failed
            "idle" -> AnalysisStatus.Idle
            else -> AnalysisStatus.Running
        },
        modelName = model?.name,
        validFrameCount = summary?.validFrameCount,
        averageConfidence = summary?.averageConfidence,
        message = error
    )
}

fun PoseScoringResultDto.toAnalysisResult(): AnalysisResult {
    return AnalysisResult(
        status = when (status.lowercase()) {
            "scored", "completed", "done", "success" -> AnalysisStatus.Completed
            else -> AnalysisStatus.Failed
        },
        averageConfidence = confidence,
        scorePreview = score?.toInt(),
        countPreview = count,
        message = feedback.joinToString("\n").ifBlank { null }
    )
}

private fun parseBackendDateTime(value: String): LocalDateTime {
    return runCatching { OffsetDateTime.parse(value).toLocalDateTime() }
        .recoverCatching { LocalDateTime.parse(value) }
        .getOrDefault(LocalDateTime.now())
}
