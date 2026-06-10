package com.fitnessai.android.data.repository

import com.fitnessai.android.core.config.ApiClientHolder
import com.fitnessai.android.data.api.InMemoryTokenStore
import com.fitnessai.android.data.model.TrainingRecord
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.test.TestScope
import org.junit.Assert.assertTrue
import org.junit.Test

class AppRepositoryContainerTest {
    @Test
    fun containerAlwaysBuildsApiRepositoriesBackedByApiClientHolder() {
        val tokenStore = InMemoryTokenStore()
        val holder = ApiClientHolder(
            tokenStore = tokenStore,
            initialBaseUrl = "http://localhost:8000/"
        )
        val testScope = CoroutineScope(SupervisorJob())

        val repositories = AppRepositoryContainer.createForTest(
            apiClientHolder = holder,
            tokenStore = tokenStore,
            notificationScheduler = NoopNotificationScheduler,
            applicationScope = testScope,
        )

        assertTrue(repositories.authRepository is ApiAuthRepository)
        assertTrue(repositories.recordRepository is ApiTrainingRecordRepository)
        assertTrue(repositories.statsRepository is ApiStatsRepository)
        assertTrue(repositories.analysisRepository is ApiScoringAnalysisRepository)
        assertTrue(repositories.videoRepository is ApiVideoRepository)
    }

    private object NoopNotificationScheduler : NotificationScheduler {
        override fun notifyAnalysisComplete(record: TrainingRecord) = Unit
    }
}
