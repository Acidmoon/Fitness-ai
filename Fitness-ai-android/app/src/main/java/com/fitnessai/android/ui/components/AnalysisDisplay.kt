package com.fitnessai.android.ui.components

import com.fitnessai.android.data.model.AnalysisResult
import com.fitnessai.android.data.model.AnalysisStatus

data class AnalysisDisplayState(
    val status: AnalysisStatus,
    val score: Int?,
    val grade: ScoreGrade?,
    val averageConfidence: Double?,
    val validFrameRatio: Double?,
    val totalFrames: Int,
    val feedback: List<String>,
    val rawDetails: AnalysisRawDetails,
    val errorMessage: String?
)

data class AnalysisRawDetails(
    val modelName: String?,
    val validFrameCount: Int?,
    val averageConfidence: Double?,
    val countPreview: Int?
)

enum class ScoreGrade(val label: String) {
    Excellent("优秀"),
    Good("良好"),
    Pass("合格"),
    NeedsWork("待提升");

    companion object {
        fun of(score: Int): ScoreGrade = when {
            score >= 90 -> Excellent
            score >= 75 -> Good
            score >= 60 -> Pass
            else -> NeedsWork
        }
    }
}

object AnalysisDisplayMapper {
    fun map(result: AnalysisResult, totalFrames: Int = result.validFrameCount ?: 0): AnalysisDisplayState {
        val score = result.scorePreview?.coerceIn(0, 100)
        val validFrames = result.validFrameCount ?: 0
        val noValidPose = result.status == AnalysisStatus.Completed && validFrames == 0
        val confidence = if (noValidPose) null else result.averageConfidence
        val ratio = when {
            noValidPose -> null
            totalFrames <= 0 -> null
            else -> validFrames.toDouble() / totalFrames.toDouble()
        }
        val feedback = result.message
            ?.lines()
            ?.map { it.trim() }
            ?.filter { it.isNotEmpty() }
            ?: emptyList()
        return AnalysisDisplayState(
            status = result.status,
            score = score,
            grade = score?.let(ScoreGrade::of),
            averageConfidence = confidence,
            validFrameRatio = ratio,
            totalFrames = totalFrames,
            feedback = feedback,
            rawDetails = AnalysisRawDetails(
                modelName = result.modelName,
                validFrameCount = result.validFrameCount,
                averageConfidence = result.averageConfidence,
                countPreview = result.countPreview
            ),
            errorMessage = when {
                noValidPose -> "未检测到有效姿态帧，请重新拍摄"
                result.status == AnalysisStatus.Failed -> result.message ?: "分析失败"
                else -> null
            }
        )
    }
}
