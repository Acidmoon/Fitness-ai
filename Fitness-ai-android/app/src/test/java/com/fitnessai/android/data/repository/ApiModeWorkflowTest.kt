package com.fitnessai.android.data.repository

import com.fitnessai.android.data.api.ApiClientFactory
import com.fitnessai.android.data.api.ExerciseRecordCreateDto
import com.fitnessai.android.data.api.InMemoryTokenStore
import com.fitnessai.android.data.api.PoseAnalysisTriggerDto
import com.fitnessai.android.data.api.PoseScoringRequestDto
import kotlinx.coroutines.test.runTest
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ApiModeWorkflowTest {
    @Test
    fun happyPathVerifiesApiModeWorkflowAndBearerTokenAttachment() = runTest {
        val server = MockWebServer()
        server.enqueue(jsonResponse("""{"access_token":"workflow-token","token_type":"bearer"}"""))
        server.enqueue(profileResponse())
        server.enqueue(jsonResponse("""[{"id":3,"name":"俯卧撑","category":"上肢"}]"""))
        server.enqueue(jsonResponse("""[]"""))
        server.enqueue(statsResponse(totalSessions = 0, totalRepetitions = 0, bestScore = 0.0))
        server.enqueue(recordResponse(id = 10, exerciseId = 3, score = 88.0, count = 24))
        server.enqueue(jsonResponse("""{"message":"uploaded","video_url":"/videos/10.mp4","file_size":12}"""))
        server.enqueue(
            jsonResponse(
                """
                {
                  "id": 7,
                  "record_id": 10,
                  "status": "queued",
                  "created_at": "2026-05-06T01:00:00Z",
                  "updated_at": "2026-05-06T01:00:00Z"
                }
                """.trimIndent()
            )
        )
        server.enqueue(
            jsonResponse(
                """
                {
                  "id": 7,
                  "record_id": 10,
                  "status": "done",
                  "created_at": "2026-05-06T01:00:00Z",
                  "updated_at": "2026-05-06T01:00:01Z",
                  "completed_at": "2026-05-06T01:00:01Z"
                }
                """.trimIndent()
            )
        )
        server.enqueue(
            jsonResponse(
                """
                {
                  "record_id": 10,
                  "status": "scored",
                  "applied": true,
                  "exercise_type": "pushup",
                  "score": 91.5,
                  "count": 24,
                  "confidence": 0.88,
                  "feedback": ["稳定"]
                }
                """.trimIndent()
            )
        )
        server.enqueue(jsonResponse("""[{"id":3,"name":"俯卧撑","category":"上肢"}]"""))
        server.enqueue(jsonResponse("""[${recordJson(id = 10, exerciseId = 3, score = 91.5, count = 24)}]"""))
        server.enqueue(statsResponse(totalSessions = 1, totalRepetitions = 24, bestScore = 91.5))
        server.start()

        try {
            val tokenStore = InMemoryTokenStore()
            val services = ApiClientFactory.create(server.url("/").toString(), tokenStore)
            val auth = ApiAuthRepository(services, tokenStore)
            val records = ApiTrainingRecordRepository(services.exercise)
            val stats = ApiStatsRepository(services.stats)

            assertTrue(auth.login("tester", "password123").isSuccess)
            assertTrue(records.refresh().isSuccess)
            assertTrue(stats.refresh().isSuccess)
            services.exercise.createRecord(
                ExerciseRecordCreateDto(
                    exerciseId = 3,
                    score = 88.0,
                    count = 24,
                    duration = 75
                )
            )
            services.video.uploadVideo(
                recordId = 10,
                video = MultipartBody.Part.createFormData(
                    name = "video",
                    filename = "clip.mp4",
                    body = "video-bytes".toRequestBody("video/mp4".toMediaType())
                )
            )
            val job = services.poseAnalysis.createPoseAnalysisJob(10, PoseAnalysisTriggerDto())
            services.poseAnalysis.getPoseAnalysisJob(job.id)
            services.poseScoring.scorePose(10, PoseScoringRequestDto(apply = true))
            assertTrue(records.refresh().isSuccess)
            assertTrue(stats.refresh().isSuccess)

            val paths = List(server.requestCount) { server.takeRequest() }
            assertEquals("/api/auth/login", paths[0].path)
            paths.drop(1).forEach { request ->
                assertEquals("Bearer workflow-token", request.getHeader("Authorization"))
            }
            assertEquals("/api/user/profile", paths[1].path)
            assertEquals("/api/exercise/exercises", paths[2].path)
            assertEquals("/api/exercise/records?skip=0&limit=100", paths[3].path)
            assertEquals("/api/stats/summary", paths[4].path)
            assertEquals("/api/exercise/records", paths[5].path)
            assertEquals("/api/video/records/10/video?keep_video=true", paths[6].path)
            assertEquals("/api/ai/records/10/pose-analysis/jobs", paths[7].path)
            assertEquals("/api/ai/pose-analysis/jobs/7", paths[8].path)
            assertEquals("/api/ai/records/10/pose-scoring", paths[9].path)
            assertEquals("/api/exercise/exercises", paths[10].path)
            assertEquals("/api/exercise/records?skip=0&limit=100", paths[11].path)
            assertEquals("/api/stats/summary", paths[12].path)
            assertEquals(1, stats.stats.value.totalRecords)
            assertEquals(91, stats.stats.value.bestScore)
        } finally {
            server.shutdown()
        }
    }

    @Test
    fun failurePathsStayRecoverableAndKeepAuthenticatedToken() = runTest {
        val server = MockWebServer()
        repeat(5) {
            server.enqueue(
                MockResponse()
                    .setResponseCode(500)
                    .setHeader("Content-Type", "application/json")
                    .setBody("""{"detail":"temporary failure"}""")
            )
        }
        server.start()

        try {
            val tokenStore = InMemoryTokenStore("retained-token")
            val services = ApiClientFactory.create(server.url("/").toString(), tokenStore)
            val records = ApiTrainingRecordRepository(services.exercise)

            assertTrue(records.refresh().isFailure)
            assertTrue(
                runCatching {
                    services.exercise.createRecord(
                        ExerciseRecordCreateDto(
                            exerciseId = 3,
                            score = 80.0,
                            count = 20,
                            duration = 60
                        )
                    )
                }.isFailure
            )
            assertTrue(
                runCatching {
                    services.video.uploadVideo(
                        recordId = 10,
                        video = MultipartBody.Part.createFormData(
                            name = "video",
                            filename = "clip.mp4",
                            body = "video-bytes".toRequestBody("video/mp4".toMediaType())
                        )
                    )
                }.isFailure
            )
            assertTrue(
                runCatching { services.poseAnalysis.createPoseAnalysisJob(10, PoseAnalysisTriggerDto()) }.isFailure
            )
            assertTrue(runCatching { services.poseScoring.scorePose(10) }.isFailure)
            assertEquals("retained-token", tokenStore.currentAccessToken())
        } finally {
            server.shutdown()
        }
    }

    private fun profileResponse(): MockResponse {
        return jsonResponse(
            """
            {
              "id": 42,
              "username": "tester",
              "email": "tester@example.com",
              "is_active": true,
              "created_at": "2026-05-06T01:00:00Z",
              "updated_at": "2026-05-06T01:00:00Z"
            }
            """.trimIndent()
        )
    }

    private fun statsResponse(
        totalSessions: Int,
        totalRepetitions: Int,
        bestScore: Double
    ): MockResponse {
        return jsonResponse(
            """
            {
              "exercise_stats": {
                "total_sessions": $totalSessions,
                "total_repetitions": $totalRepetitions,
                "average_score": $bestScore,
                "best_score": $bestScore,
                "total_duration": 75
              },
              "category_stats": [],
              "recent_records": []
            }
            """.trimIndent()
        )
    }

    private fun recordResponse(
        id: Int,
        exerciseId: Int,
        score: Double,
        count: Int
    ): MockResponse {
        return jsonResponse(recordJson(id, exerciseId, score, count))
    }

    private fun recordJson(
        id: Int,
        exerciseId: Int,
        score: Double,
        count: Int
    ): String {
        return """
            {
              "id": $id,
              "exercise_id": $exerciseId,
              "score": $score,
              "count": $count,
              "duration": 75,
              "heart_rate_avg": null,
              "video_url": "/videos/$id.mp4",
              "feedback": "稳定",
              "created_at": "2026-05-06T01:10:00Z"
            }
        """.trimIndent()
    }

    private fun jsonResponse(body: String): MockResponse {
        return MockResponse()
            .setHeader("Content-Type", "application/json")
            .setBody(body)
    }
}
