package com.fitnessai.android.data.repository

import android.app.Application
import com.fitnessai.android.data.api.ApiClientFactory
import com.fitnessai.android.data.api.PreferencesTokenStore
import com.fitnessai.android.data.api.TokenStore
import com.fitnessai.android.data.config.AppBackendConfiguration
import com.fitnessai.android.data.config.BackendConfiguration
import com.fitnessai.android.data.config.BackendMode

data class AppRepositories(
    val authRepository: AuthRepository,
    val recordRepository: TrainingRecordRepository,
    val analysisRepository: AnalysisRepository,
    val videoRepository: VideoRepository
)

object AppRepositoryContainer {
    fun create(
        application: Application,
        configuration: BackendConfiguration = AppBackendConfiguration.fromBuildConfig(),
        tokenStore: TokenStore = PreferencesTokenStore(application)
    ): AppRepositories {
        return createForTest(
            configuration = configuration,
            tokenStore = tokenStore,
            notificationScheduler = AndroidNotificationScheduler(application)
        )
    }

    fun createForTest(
        configuration: BackendConfiguration,
        tokenStore: TokenStore,
        notificationScheduler: NotificationScheduler
    ): AppRepositories {
        val recordRepository = InMemoryTrainingRecordRepository()
        val analysisRepository = SimulatedAnalysisRepository(recordRepository, notificationScheduler)
        val videoRepository = LocalVideoRepository(recordRepository, analysisRepository)
        val authRepository = when (configuration.mode) {
            BackendMode.Mock -> InMemoryAuthRepository()
            BackendMode.Api -> {
                val services = ApiClientFactory.create(configuration.baseUrl, tokenStore)
                ApiAuthRepository(services, tokenStore)
            }
        }
        return AppRepositories(
            authRepository = authRepository,
            recordRepository = recordRepository,
            analysisRepository = analysisRepository,
            videoRepository = videoRepository
        )
    }
}
