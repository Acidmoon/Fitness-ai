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
    val exerciseCatalogRepository: ExerciseCatalogRepository,
    val statsRepository: StatsRepository,
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
        val services = if (configuration.mode == BackendMode.Api) {
            ApiClientFactory.create(configuration.baseUrl, tokenStore)
        } else {
            null
        }
        val recordRepository = when (configuration.mode) {
            BackendMode.Mock -> InMemoryTrainingRecordRepository()
            BackendMode.Api -> ApiTrainingRecordRepository(requireNotNull(services).exercise)
        }
        val statsRepository = when (configuration.mode) {
            BackendMode.Mock -> LocalStatsRepository(recordRepository)
            BackendMode.Api -> ApiStatsRepository(requireNotNull(services).stats)
        }
        val localAnalysisRepository = SimulatedAnalysisRepository(recordRepository, notificationScheduler)
        val analysisRepository = when (configuration.mode) {
            BackendMode.Mock -> localAnalysisRepository
            BackendMode.Api -> ApiScoringAnalysisRepository(
                service = requireNotNull(services).poseScoring,
                records = recordRepository,
                delegate = localAnalysisRepository
            )
        }
        val videoRepository = LocalVideoRepository(recordRepository, analysisRepository)
        val authRepository = when (configuration.mode) {
            BackendMode.Mock -> InMemoryAuthRepository()
            BackendMode.Api -> {
                ApiAuthRepository(requireNotNull(services), tokenStore)
            }
        }
        return AppRepositories(
            authRepository = authRepository,
            recordRepository = recordRepository,
            exerciseCatalogRepository = recordRepository as ExerciseCatalogRepository,
            statsRepository = statsRepository,
            analysisRepository = analysisRepository,
            videoRepository = videoRepository
        )
    }
}
