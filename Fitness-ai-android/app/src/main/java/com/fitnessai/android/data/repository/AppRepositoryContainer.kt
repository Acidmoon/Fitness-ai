package com.fitnessai.android.data.repository

import android.app.Application
import android.net.Uri
import android.provider.OpenableColumns
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
            BackendMode.Api -> ApiTrainingRecordRepository(
                service = requireNotNull(services).exercise,
                baseUrl = configuration.baseUrl
            )
        }
        val statsRepository = when (configuration.mode) {
            BackendMode.Mock -> LocalStatsRepository(recordRepository)
            BackendMode.Api -> ApiStatsRepository(requireNotNull(services).stats)
        }
        val localAnalysisRepository = SimulatedAnalysisRepository(recordRepository, notificationScheduler)
        val baseAnalysisRepository = when (configuration.mode) {
            BackendMode.Mock -> localAnalysisRepository
            BackendMode.Api -> ApiPoseAnalysisRepository(
                service = requireNotNull(services).poseAnalysis,
                records = recordRepository,
                notifications = notificationScheduler
            )
        }
        val analysisRepository = when (configuration.mode) {
            BackendMode.Mock -> baseAnalysisRepository
            BackendMode.Api -> ApiScoringAnalysisRepository(
                service = requireNotNull(services).poseScoring,
                records = recordRepository,
                delegate = baseAnalysisRepository
            )
        }
        val videoRepository = when (configuration.mode) {
            BackendMode.Mock -> LocalVideoRepository(recordRepository, analysisRepository)
            BackendMode.Api -> ApiVideoRepository(
                service = requireNotNull(services).video,
                records = recordRepository,
                analysis = analysisRepository,
                contentProvider = AndroidVideoContentProvider(notificationScheduler)
            )
        }
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

private class AndroidVideoContentProvider(
    private val notificationScheduler: NotificationScheduler
) : VideoContentProvider {
    override fun read(uri: Uri): VideoContent {
        val application = (notificationScheduler as? AndroidNotificationScheduler)?.application
            ?: throw IllegalStateException("无法读取视频内容")
        val resolver = application.contentResolver
        val mimeType = resolver.getType(uri) ?: "video/mp4"
        val name = resolver.query(uri, null, null, null, null)?.use { cursor ->
            val index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
            if (index >= 0 && cursor.moveToFirst()) cursor.getString(index) else null
        } ?: "training-video.mp4"
        val bytes = resolver.openInputStream(uri)?.use { it.readBytes() }
            ?: throw IllegalStateException("无法读取视频内容")
        return VideoContent(bytes = bytes, mimeType = mimeType, fileName = name)
    }
}
