package com.fitnessai.android.data.repository

import com.fitnessai.android.data.api.InMemoryTokenStore
import com.fitnessai.android.data.config.BackendConfiguration
import com.fitnessai.android.data.config.BackendMode
import com.fitnessai.android.data.model.TrainingRecord
import org.junit.Assert.assertTrue
import org.junit.Test

class AppRepositoryContainerTest {
    @Test
    fun mockModeSelectsExistingLocalRepositories() {
        val repositories = AppRepositoryContainer.createForTest(
            configuration = BackendConfiguration(mode = BackendMode.Mock),
            tokenStore = InMemoryTokenStore(),
            notificationScheduler = NoopNotificationScheduler
        )

        assertTrue(repositories.authRepository is InMemoryAuthRepository)
        assertTrue(repositories.recordRepository is InMemoryTrainingRecordRepository)
        assertTrue(repositories.statsRepository is LocalStatsRepository)
        assertTrue(repositories.analysisRepository is SimulatedAnalysisRepository)
        assertTrue(repositories.videoRepository is LocalVideoRepository)
    }

    @Test
    fun apiModeUsesApiAuthAndApiReadRepositoriesWhileKeepingUnintegratedCapabilitiesLocal() {
        val repositories = AppRepositoryContainer.createForTest(
            configuration = BackendConfiguration(
                mode = BackendMode.Api,
                baseUrl = "http://localhost:8000/"
            ),
            tokenStore = InMemoryTokenStore(),
            notificationScheduler = NoopNotificationScheduler
        )

        assertTrue(repositories.authRepository is ApiAuthRepository)
        assertTrue(repositories.recordRepository is ApiTrainingRecordRepository)
        assertTrue(repositories.statsRepository is ApiStatsRepository)
        assertTrue(repositories.analysisRepository is ApiScoringAnalysisRepository)
        assertTrue(repositories.videoRepository is LocalVideoRepository)
    }

    private object NoopNotificationScheduler : NotificationScheduler {
        override fun notifyAnalysisComplete(record: TrainingRecord) = Unit
    }
}
