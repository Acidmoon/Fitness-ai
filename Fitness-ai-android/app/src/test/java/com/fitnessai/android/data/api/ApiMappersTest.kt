package com.fitnessai.android.data.api

import com.fitnessai.android.data.model.AnalysisStatus
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Test

class ApiMappersTest {
    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun mapsProfileRecordStatsAndAnalysisDtosToDomainModels() {
        val profile = json.decodeFromString<UserProfileDto>(
            """
            {
              "id": 7,
              "username": "student_a",
              "email": "student@example.com",
              "is_active": true,
              "created_at": "2026-05-06T01:00:00Z",
              "updated_at": "2026-05-06T01:00:00Z"
            }
            """.trimIndent()
        )
        val exercise = ExerciseDto(id = 3, name = "俯卧撑", category = "上肢")
        val record = json.decodeFromString<ExerciseRecordDto>(
            """
            {
              "id": 11,
              "exercise_id": 3,
              "score": 88.5,
              "count": 24,
              "duration": 75,
              "heart_rate_avg": null,
              "video_url": "/videos/pushup.mp4",
              "feedback": "动作稳定",
              "created_at": "2026-05-06T01:10:00Z"
            }
            """.trimIndent()
        )
        val stats = json.decodeFromString<StatsSummaryDto>(
            """
            {
              "exercise_stats": {
                "total_sessions": 2,
                "total_repetitions": 56,
                "average_score": 87.25,
                "best_score": 90,
                "total_duration": 135
              },
              "category_stats": [],
              "recent_records": []
            }
            """.trimIndent()
        )
        val analysis = json.decodeFromString<PoseAnalysisResultDto>(
            """
            {
              "record_id": 11,
              "schema_version": 1,
              "status": "done",
              "model": { "name": "MoveNet", "input_size": 192 },
              "summary": {
                "total_frames": 120,
                "processed_frames": 120,
                "sampled_frames": 60,
                "valid_frame_count": 58,
                "average_confidence": 0.86,
                "source_fps": 30,
                "sample_fps": 15
              },
              "frames": []
            }
            """.trimIndent()
        )
        val scoring = json.decodeFromString<PoseScoringResultDto>(
            """
            {
              "record_id": 11,
              "status": "scored",
              "applied": false,
              "exercise_type": "pushup",
              "score": 91.5,
              "count": 26,
              "confidence": 0.88,
              "feedback": ["节奏稳定", "髋部略低"]
            }
            """.trimIndent()
        )
        val weekly = json.decodeFromString<List<WeeklyStatsDto>>(
            """
            [
              { "date": "2026-05-04", "sessions": 2, "average_score": 86.5 },
              { "date": "2026-05-05", "sessions": 1, "average_score": 90 }
            ]
            """.trimIndent()
        )
        val personalBest = json.decodeFromString<List<PersonalBestStatsDto>>(
            """
            [
              { "exercise_name": "俯卧撑", "best_score": 95.5, "best_count": 40 },
              { "exercise_name": "平板支撑", "best_score": null, "best_count": null }
            ]
            """.trimIndent()
        )
        val emptyPersonalBest = json.decodeFromString<List<PersonalBestStatsDto>>("[]")

        val session = profile.toUserSession()
        val trainingRecord = record.toTrainingRecord(exercise)
        val summary = stats.toStatsSummary()
        val result = analysis.toAnalysisResult()
        val scoringResult = scoring.toAnalysisResult()
        val weeklyPoint = weekly.first().toWeeklyStatsPoint()
        val best = personalBest.first().toPersonalBestStats()

        assertEquals("7", session.userId)
        assertEquals("student_a", session.displayName)
        assertEquals("俯卧撑", trainingRecord.exerciseName)
        assertEquals("上肢", trainingRecord.category)
        assertEquals(88, trainingRecord.score)
        assertEquals(2, summary.totalRecords)
        assertEquals(56, summary.totalCount)
        assertEquals(AnalysisStatus.Completed, result.status)
        assertEquals("MoveNet", result.modelName)
        assertEquals(58, result.validFrameCount)
        assertEquals(AnalysisStatus.Completed, scoringResult.status)
        assertEquals(91, scoringResult.scorePreview)
        assertEquals(26, scoringResult.countPreview)
        assertEquals(0.88, scoringResult.averageConfidence ?: 0.0, 0.0)
        assertEquals("节奏稳定\n髋部略低", scoringResult.message)
        assertEquals("2026-05-04", weeklyPoint.date)
        assertEquals(2, weeklyPoint.sessions)
        assertEquals(86.5, weeklyPoint.averageScore, 0.0)
        assertEquals("俯卧撑", best.exerciseName)
        assertEquals(95.5, best.bestScore ?: 0.0, 0.0)
        assertEquals(40, best.bestCount)
        assertEquals(null, personalBest[1].bestScore)
        assertEquals(0, emptyPersonalBest.size)
    }
}
