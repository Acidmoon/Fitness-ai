package com.fitnessai.android.data.repository

import com.fitnessai.android.data.api.ApiClientFactory
import com.fitnessai.android.data.api.InMemoryTokenStore
import com.fitnessai.android.data.model.TrainingRecord
import kotlinx.coroutines.test.runTest
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ApiReadRepositoriesTest {
    @Test
    fun refreshMapsBackendRecordsWithExerciseCatalogAndFallback() = runTest {
        val server = MockWebServer()
        server.enqueue(jsonResponse("""[{"id":3,"name":"俯卧撑","category":"上肢","description":null}]"""))
        server.enqueue(
            jsonResponse(
                """
                [
                  {
                    "id": 10,
                    "exercise_id": 3,
                    "score": 88.5,
                    "count": 24,
                    "duration": 75,
                    "heart_rate_avg": null,
                    "video_url": "/videos/a.mp4",
                    "feedback": "稳定",
                    "created_at": "2026-05-06T01:10:00Z"
                  },
                  {
                    "id": 11,
                    "exercise_id": 99,
                    "score": 70,
                    "count": 12,
                    "duration": 45,
                    "heart_rate_avg": null,
                    "video_url": null,
                    "feedback": null,
                    "created_at": "2026-05-06T01:20:00Z"
                  }
                ]
                """.trimIndent()
            )
        )
        server.start()
        try {
            val baseUrl = server.url("/").toString()
            val services = ApiClientFactory.create(baseUrl, InMemoryTokenStore("token"))
            val repository = ApiTrainingRecordRepository(
                services = { services },
                baseUrlProvider = { baseUrl }
            )

            val result = repository.refresh()

            assertTrue(result.isSuccess)
            assertEquals("俯卧撑", repository.records.value[0].exerciseName)
            assertEquals("上肢", repository.records.value[0].category)
            assertEquals(88, repository.records.value[0].score)
            assertEquals("动作 #99", repository.records.value[1].exerciseName)
            assertEquals("未分类", repository.records.value[1].category)
            assertEquals("/api/exercise/exercises", server.takeRequest().path)
            assertEquals("/api/exercise/records?skip=0&limit=100", server.takeRequest().path)
        } finally {
            server.shutdown()
        }
    }

    @Test
    fun refreshMapsBackendStatsSummary() = runTest {
        val server = MockWebServer()
        server.enqueue(
            jsonResponse(
                """
                {
                  "exercise_stats": {
                    "total_sessions": 3,
                    "total_repetitions": 76,
                    "average_score": 87.4,
                    "best_score": 96,
                    "total_duration": 180
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
            val repository = ApiStatsRepository { services }

            val result = repository.refresh()

            assertTrue(result.isSuccess)
            assertEquals(3, repository.stats.value.totalRecords)
            assertEquals(76, repository.stats.value.totalCount)
            assertEquals(180, repository.stats.value.totalDurationSeconds)
            assertEquals(96, repository.stats.value.bestScore)
        } finally {
            server.shutdown()
        }
    }

    @Test
    fun apiRecordMutationsUseBackendEndpointsAndBearerToken() = runTest {
        val server = MockWebServer()
        server.enqueue(jsonResponse("""[{"id":3,"name":"俯卧撑","category":"上肢","description":null}]"""))
        server.enqueue(jsonResponse("""[]"""))
        server.enqueue(recordResponse(id = 20, exerciseId = 3, score = 88.0, count = 24, duration = 75))
        server.enqueue(recordResponse(id = 20, exerciseId = 3, score = 91.0, count = 26, duration = 80))
        server.enqueue(MockResponse().setResponseCode(204))
        server.enqueue(jsonResponse("""[{"id":3,"name":"俯卧撑","category":"上肢","description":null}]"""))
        server.enqueue(jsonResponse("""[]"""))
        server.start()
        try {
            val baseUrl = server.url("/").toString()
            val services = ApiClientFactory.create(baseUrl, InMemoryTokenStore("token"))
            val repository = ApiTrainingRecordRepository(
                services = { services },
                baseUrlProvider = { baseUrl }
            )

            assertTrue(repository.refresh().isSuccess)
            assertEquals(1, repository.exercises.value.size)
            assertEquals("俯卧撑", repository.exercises.value.first().name)

            val created = repository.createRecord(
                TrainingRecord(
                    exerciseId = "3",
                    exerciseName = "俯卧撑",
                    category = "上肢",
                    count = 24,
                    score = 88,
                    durationSeconds = 75
                )
            ).getOrThrow()
            val updated = repository.updateRecord(
                created.copy(count = 26, score = 91, durationSeconds = 80)
            ).getOrThrow()
            val deleted = repository.deleteRecord(updated.id)
            assertTrue(deleted.isSuccess)
            assertTrue(repository.refresh().isSuccess)

            server.takeRequest()
            server.takeRequest()
            val createRequest = server.takeRequest()
            val updateRequest = server.takeRequest()
            val deleteRequest = server.takeRequest()
            assertEquals("/api/exercise/records", createRequest.path)
            assertEquals("Bearer token", createRequest.getHeader("Authorization"))
            assertTrue(createRequest.body.readUtf8().contains(""""exercise_id":3"""))
            assertEquals("/api/exercise/records/20", updateRequest.path)
            assertEquals("Bearer token", updateRequest.getHeader("Authorization"))
            assertTrue(updateRequest.body.readUtf8().contains(""""count":26"""))
            assertEquals("/api/exercise/records/20", deleteRequest.path)
            assertEquals("Bearer token", deleteRequest.getHeader("Authorization"))
            assertEquals(0, repository.records.value.size)
        } finally {
            server.shutdown()
        }
    }

    private fun jsonResponse(body: String): MockResponse {
        return MockResponse()
            .setHeader("Content-Type", "application/json")
            .setBody(body)
    }

    private fun recordResponse(
        id: Int,
        exerciseId: Int,
        score: Double,
        count: Int,
        duration: Int
    ): MockResponse {
        return jsonResponse(
            """
            {
              "id": $id,
              "exercise_id": $exerciseId,
              "score": $score,
              "count": $count,
              "duration": $duration,
              "heart_rate_avg": null,
              "video_url": null,
              "feedback": null,
              "created_at": "2026-05-06T01:10:00Z"
            }
            """.trimIndent()
        )
    }
}
