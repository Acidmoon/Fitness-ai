package com.fitnessai.android.data.repository

import com.fitnessai.android.data.api.ApiClientFactory
import com.fitnessai.android.data.api.InMemoryTokenStore
import com.fitnessai.android.data.model.AnalysisResult
import com.fitnessai.android.data.model.AnalysisStatus
import com.fitnessai.android.data.model.TrainingRecord
import kotlinx.coroutines.test.runTest
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ApiScoringAnalysisRepositoryTest {
    @Test
    fun previewScoringSendsRequestAndMapsReturnedFeedback() = runTest {
        val server = MockWebServer()
        server.enqueue(
            jsonResponse(
                """
                {
                  "record_id": 10,
                  "status": "scored",
                  "applied": false,
                  "score": 92.5,
                  "count": 27,
                  "confidence": 0.91,
                  "feedback": ["动作稳定", "继续保持"]
                }
                """.trimIndent()
            )
        )
        server.start()
        try {
            val records = InMemoryTrainingRecordRepository()
            records.createRecord(completedRecord(id = "10"))
            val repository = ApiScoringAnalysisRepository(
                service = ApiClientFactory.create(server.url("/").toString(), InMemoryTokenStore("token"))
                    .poseScoring,
                records = records,
                delegate = NoopAnalysisRepository
            )

            val result = repository.scorePose(recordId = "10", apply = false)

            assertTrue(result.isSuccess)
            val request = server.takeRequest()
            assertEquals("/api/ai/records/10/pose-scoring", request.path)
            assertEquals("Bearer token", request.getHeader("Authorization"))
            assertEquals("{}", request.body.readUtf8())
            val analysis = requireNotNull(records.getRecord("10")).analysisResult
            assertEquals(AnalysisStatus.Completed, analysis.status)
            assertEquals(92, analysis.scorePreview)
            assertEquals(27, analysis.countPreview)
            assertEquals(0.91, analysis.averageConfidence ?: 0.0, 0.0)
            assertEquals("动作稳定\n继续保持", analysis.message)
        } finally {
            server.shutdown()
        }
    }

    @Test
    fun appliedScoringCanRefreshRecordAndStatsState() = runTest {
        val server = MockWebServer()
        server.enqueue(
            jsonResponse(
                """
                {
                  "record_id": 10,
                  "status": "scored",
                  "applied": true,
                  "score": 94,
                  "count": 30,
                  "confidence": 0.9,
                  "feedback": ["已应用"]
                }
                """.trimIndent()
            )
        )
        server.enqueue(jsonResponse("""[{"id":3,"name":"俯卧撑","category":"上肢"}]"""))
        server.enqueue(
            jsonResponse(
                """
                [
                  {
                    "id": 10,
                    "exercise_id": 3,
                    "score": 94,
                    "count": 30,
                    "duration": 75,
                    "heart_rate_avg": null,
                    "video_url": "/videos/10.mp4",
                    "feedback": "已应用",
                    "created_at": "2026-05-06T01:10:00Z"
                  }
                ]
                """.trimIndent()
            )
        )
        server.enqueue(
            jsonResponse(
                """
                {
                  "exercise_stats": {
                    "total_sessions": 1,
                    "total_repetitions": 30,
                    "average_score": 94,
                    "best_score": 94,
                    "total_duration": 75
                  },
                  "category_stats": [],
                  "recent_records": []
                }
                """.trimIndent()
            )
        )
        server.start()
        try {
            val services = ApiClientFactory.create(server.url("/").toString(), InMemoryTokenStore("token"))
            val records = ApiTrainingRecordRepository(services.exercise, server.url("/").toString())
            val stats = ApiStatsRepository(services.stats)
            val scoring = ApiScoringAnalysisRepository(
                service = services.poseScoring,
                records = records,
                delegate = NoopAnalysisRepository
            )

            assertTrue(scoring.scorePose(recordId = "10", apply = true).isSuccess)
            assertTrue(records.refresh().isSuccess)
            assertTrue(stats.refresh().isSuccess)

            assertEquals(94, records.records.value.first().score)
            assertEquals(30, records.records.value.first().count)
            assertEquals(1, stats.stats.value.totalRecords)
            assertEquals(30, stats.stats.value.totalCount)
            assertEquals(94, stats.stats.value.bestScore)
            assertEquals("""{"apply":true}""", server.takeRequest().body.readUtf8())
        } finally {
            server.shutdown()
        }
    }

    @Test
    fun scoringFailurePreservesExistingAnalysisState() = runTest {
        val server = MockWebServer()
        server.enqueue(
            MockResponse()
                .setResponseCode(500)
                .setHeader("Content-Type", "application/json")
                .setBody("""{"detail":"scoring failed"}""")
        )
        server.start()
        try {
            val records = InMemoryTrainingRecordRepository()
            val existing = completedRecord(id = "10").copy(
                analysisResult = AnalysisResult(
                    status = AnalysisStatus.Completed,
                    modelName = "MoveNet",
                    validFrameCount = 42,
                    averageConfidence = 0.8,
                    scorePreview = 86,
                    countPreview = 24,
                    message = "已有分析"
                )
            )
            records.createRecord(existing)
            val repository = ApiScoringAnalysisRepository(
                service = ApiClientFactory.create(server.url("/").toString(), InMemoryTokenStore("token"))
                    .poseScoring,
                records = records,
                delegate = NoopAnalysisRepository
            )

            val result = repository.scorePose(recordId = "10", apply = true)

            assertTrue(result.isFailure)
            assertEquals(existing.analysisResult, records.getRecord("10")?.analysisResult)
        } finally {
            server.shutdown()
        }
    }

    private fun completedRecord(id: String): TrainingRecord {
        return TrainingRecord(
            id = id,
            exerciseName = "俯卧撑",
            category = "上肢",
            count = 24,
            score = 86,
            analysisResult = AnalysisResult(status = AnalysisStatus.Completed)
        )
    }

    private object NoopAnalysisRepository : AnalysisRepository {
        override suspend fun startAnalysis(recordId: String): Result<Unit> = Result.success(Unit)
        override fun clearAnalysis(recordId: String) = Unit
    }

    private fun jsonResponse(body: String): MockResponse {
        return MockResponse()
            .setHeader("Content-Type", "application/json")
            .setBody(body)
    }
}
