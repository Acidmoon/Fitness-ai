package com.fitnessai.android.data.repository

import com.fitnessai.android.data.api.ApiClientFactory
import com.fitnessai.android.data.api.InMemoryTokenStore
import com.fitnessai.android.data.model.AnalysisStatus
import com.fitnessai.android.data.model.TrainingRecord
import kotlinx.coroutines.test.runTest
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ApiPoseAnalysisRepositoryTest {
    @Test
    fun createsPollsAndMapsCompletedAnalysisJob() = runTest {
        val server = MockWebServer()
        server.enqueue(jobResponse(status = "queued"))
        server.enqueue(jobResponse(status = "running"))
        server.enqueue(jobResponse(status = "done", completed = true))
        server.enqueue(
            jsonResponse(
                """
                {
                  "record_id": 10,
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
        )
        server.start()
        try {
            val records = InMemoryTrainingRecordRepository()
            records.createRecord(record())
            val notifications = CapturingNotificationScheduler()
            val services = ApiClientFactory.create(server.url("/").toString(), InMemoryTokenStore("token"))
            val repository = ApiPoseAnalysisRepository(
                services = { services },
                records = records,
                notifications = notifications,
                polling = ApiAnalysisPollingConfig(intervalMillis = 0, maxAttempts = 3)
            )

            val result = repository.startAnalysis("10")

            assertTrue(result.isSuccess)
            val createRequest = server.takeRequest()
            val firstPoll = server.takeRequest()
            val secondPoll = server.takeRequest()
            val resultRequest = server.takeRequest()
            assertEquals("/api/ai/records/10/pose-analysis/jobs", createRequest.path)
            assertEquals("Bearer token", createRequest.getHeader("Authorization"))
            assertEquals("/api/ai/pose-analysis/jobs/7", firstPoll.path)
            assertEquals("Bearer token", firstPoll.getHeader("Authorization"))
            assertEquals("/api/ai/pose-analysis/jobs/7", secondPoll.path)
            assertEquals("/api/ai/records/10/pose-analysis", resultRequest.path)
            val analysis = requireNotNull(records.getRecord("10")).analysisResult
            assertEquals(AnalysisStatus.Completed, analysis.status)
            assertEquals("MoveNet", analysis.modelName)
            assertEquals(58, analysis.validFrameCount)
            assertEquals(1, notifications.count)
        } finally {
            server.shutdown()
        }
    }

    @Test
    fun failedJobStoresRecoverableFailedAnalysisState() = runTest {
        val server = MockWebServer()
        server.enqueue(jobResponse(status = "queued"))
        server.enqueue(jobResponse(status = "failed", error = "bad video", completed = true))
        server.start()
        try {
            val records = InMemoryTrainingRecordRepository()
            records.createRecord(record())
            val services = ApiClientFactory.create(server.url("/").toString(), InMemoryTokenStore("token"))
            val repository = ApiPoseAnalysisRepository(
                services = { services },
                records = records,
                notifications = CapturingNotificationScheduler(),
                polling = ApiAnalysisPollingConfig(intervalMillis = 0, maxAttempts = 2)
            )

            val result = repository.startAnalysis("10")

            assertTrue(result.isFailure)
            val analysis = requireNotNull(records.getRecord("10")).analysisResult
            assertEquals(AnalysisStatus.Failed, analysis.status)
            assertEquals("bad video", analysis.message)
        } finally {
            server.shutdown()
        }
    }

    @Test
    fun pollingTimeoutStoresRecoverableFailure() = runTest {
        val server = MockWebServer()
        server.enqueue(jobResponse(status = "queued"))
        server.enqueue(jobResponse(status = "running"))
        server.enqueue(jobResponse(status = "running"))
        server.start()
        try {
            val records = InMemoryTrainingRecordRepository()
            records.createRecord(record())
            val services = ApiClientFactory.create(server.url("/").toString(), InMemoryTokenStore("token"))
            val repository = ApiPoseAnalysisRepository(
                services = { services },
                records = records,
                notifications = CapturingNotificationScheduler(),
                polling = ApiAnalysisPollingConfig(intervalMillis = 0, maxAttempts = 2)
            )

            val result = repository.startAnalysis("10")

            assertTrue(result.isFailure)
        } finally {
            server.shutdown()
        }
    }

    private fun record(): TrainingRecord {
        return TrainingRecord(
            id = "10",
            exerciseId = "3",
            exerciseName = "俯卧撑",
            category = "上肢",
            count = 24
        )
    }

    private class CapturingNotificationScheduler : NotificationScheduler {
        var count = 0
        override fun notifyAnalysisComplete(record: TrainingRecord) {
            count += 1
        }
    }

    private fun jobResponse(status: String, error: String? = null, completed: Boolean = false): MockResponse {
        val completedAt = if (completed) """"completed_at":"2026-05-06T01:00:01Z",""" else """"completed_at":null,"""
        val errorValue = error?.let { """"$it"""" } ?: "null"
        return jsonResponse(
            """
            {
              "id": 7,
              "record_id": 10,
              "status": "$status",
              "error": $errorValue,
              "result_summary": null,
              "created_at": "2026-05-06T01:00:00Z",
              "updated_at": "2026-05-06T01:00:00Z",
              $completedAt
              "ignored": true
            }
            """.trimIndent()
        )
    }

    private fun jsonResponse(body: String): MockResponse {
        return MockResponse()
            .setHeader("Content-Type", "application/json")
            .setBody(body)
    }
}
