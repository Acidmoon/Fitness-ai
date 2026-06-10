package com.fitnessai.android.data.repository

import android.app.Application
import android.net.Uri
import android.provider.OpenableColumns
import com.fitnessai.android.core.config.ApiClientHolder
import com.fitnessai.android.data.api.ApiServices
import com.fitnessai.android.data.api.PreferencesTokenStore
import com.fitnessai.android.data.api.TokenStore
import kotlinx.coroutines.CoroutineScope

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
        apiClientHolder: ApiClientHolder,
        applicationScope: CoroutineScope,
        tokenStore: TokenStore = PreferencesTokenStore(application)
    ): AppRepositories {
        return createForTest(
            apiClientHolder = apiClientHolder,
            tokenStore = tokenStore,
            notificationScheduler = AndroidNotificationScheduler(application),
            applicationScope = applicationScope,
        )
    }

    fun createForTest(
        apiClientHolder: ApiClientHolder,
        tokenStore: TokenStore,
        notificationScheduler: NotificationScheduler,
        applicationScope: CoroutineScope,
    ): AppRepositories {
        val services: () -> ApiServices = { apiClientHolder.services.value }
        val recordRepository = ApiTrainingRecordRepository(
            services = services,
            baseUrlProvider = { apiClientHolder.baseUrl.value }
        )
        val statsRepository = ApiStatsRepository(services)
        val baseAnalysisRepository = ApiPoseAnalysisRepository(
            services = services,
            records = recordRepository,
            notifications = notificationScheduler,
            applicationScope = applicationScope,
        )
        val analysisRepository = ApiScoringAnalysisRepository(
            services = services,
            records = recordRepository,
            delegate = baseAnalysisRepository
        )
        val videoRepository = ApiVideoRepository(
            services = services,
            records = recordRepository,
            analysis = analysisRepository,
            contentProvider = AndroidVideoContentProvider(notificationScheduler)
        )
        val authRepository = ApiAuthRepository(
            services = services,
            tokenStore = tokenStore
        )
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
        return VideoContent.streaming(mimeType = mimeType, fileName = name) { sink ->
            resolver.openInputStream(uri)?.use { input ->
                sink.outputStream().use { output -> input.copyTo(output) }
            } ?: throw IllegalStateException("无法读取视频内容")
        }
    }
}
