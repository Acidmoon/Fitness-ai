package com.fitnessai.android.data.repository

import com.fitnessai.android.data.api.ApiClientFactory
import com.fitnessai.android.data.api.InMemoryTokenStore
import kotlinx.coroutines.test.runTest
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.RequestBody.Companion.toRequestBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ApiVideoRepositoryTest {
    @Test
    fun uploadUsesBackendVideoEndpointAndRefreshesRecords() = runTest {
        val server = MockWebServer()
        server.enqueue(jsonResponse("""{"message":"uploaded","video_url":"/videos/10.mp4","file_size":5}"""))
        server.enqueue(jsonResponse("""[{"id":3,"name":"俯卧撑","category":"上肢","description":null}]"""))
        server.enqueue(
            jsonResponse(
                """
                [
                  {
                    "id": 10,
                    "exercise_id": 3,
                    "score": 88,
                    "count": 24,
                    "duration": 75,
                    "heart_rate_avg": null,
                    "video_url": "/videos/10.mp4",
                    "feedback": null,
                    "created_at": "2026-05-06T01:10:00Z"
                  }
                ]
                """.trimIndent()
            )
        )
        server.start()
        try {
            val baseUrl = server.url("/").toString()
            val services = ApiClientFactory.create(baseUrl, InMemoryTokenStore("token"))
            val records = ApiTrainingRecordRepository(
                services = { services },
                baseUrlProvider = { baseUrl }
            )
            val repository = ApiVideoRepository(
                services = { services },
                records = records,
                analysis = NoopAnalysisRepository,
                contentProvider = VideoContentProvider {
                    VideoContent(
                        body = "video".encodeToByteArray().toRequestBody("video/mp4".toMediaTypeOrNull()),
                        mimeType = "video/mp4",
                        fileName = "clip.mp4"
                    )
                }
            )

            val result = repository.attachVideoContent(
                "10",
                VideoContent(
                    body = "video".encodeToByteArray().toRequestBody("video/mp4".toMediaTypeOrNull()),
                    mimeType = "video/mp4",
                    fileName = "clip.mp4"
                )
            )

            assertTrue(result.isSuccess)
            val uploadRequest = server.takeRequest()
            assertEquals("/api/video/records/10/video?keep_video=true", uploadRequest.path)
            assertEquals("Bearer token", uploadRequest.getHeader("Authorization"))
            assertTrue(uploadRequest.body.readUtf8().contains("clip.mp4"))
            assertEquals(1, records.records.value.size)
            assertEquals("10", records.records.value.first().id)
        } finally {
            server.shutdown()
        }
    }

    @Test
    fun uploadFailureDoesNotMutateRecordState() = runTest {
        val server = MockWebServer()
        server.enqueue(
            MockResponse()
                .setResponseCode(500)
                .setHeader("Content-Type", "application/json")
                .setBody("""{"detail":"upload failed"}""")
        )
        server.start()
        try {
            val services = ApiClientFactory.create(server.url("/").toString(), InMemoryTokenStore("token"))
            val records = InMemoryTrainingRecordRepository()
            val beforeCount = records.records.value.size
            val repository = ApiVideoRepository(
                services = { services },
                records = records,
                analysis = NoopAnalysisRepository,
                contentProvider = VideoContentProvider {
                    VideoContent.fromBytes("video".encodeToByteArray())
                }
            )

            val result = repository.attachVideoContent("10", VideoContent.fromBytes("video".encodeToByteArray()))

            assertTrue(result.isFailure)
            assertEquals(beforeCount, records.records.value.size)
        } finally {
            server.shutdown()
        }
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
