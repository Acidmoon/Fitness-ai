package com.fitnessai.android.data.repository

import com.fitnessai.android.data.api.ApiErrorKind
import com.fitnessai.android.data.api.ApiRequestException
import com.fitnessai.android.data.api.ApiServices
import com.fitnessai.android.data.api.ExerciseApiService
import com.fitnessai.android.data.api.ExerciseRecordCreateDto
import com.fitnessai.android.data.api.ExerciseRecordUpdateDto
import com.fitnessai.android.data.api.PoseAnalysisApiService
import com.fitnessai.android.data.api.PoseAnalysisTriggerDto
import com.fitnessai.android.data.api.PoseScoringApiService
import com.fitnessai.android.data.api.PoseScoringRequestDto
import com.fitnessai.android.data.api.StatsApiService
import com.fitnessai.android.data.api.VideoApiService
import com.fitnessai.android.data.api.WeeklyStatsDto
import com.fitnessai.android.data.api.apiResult
import com.fitnessai.android.data.api.toAnalysisResult
import com.fitnessai.android.data.api.toExerciseCatalogItem
import com.fitnessai.android.data.api.toStatsSummary
import com.fitnessai.android.data.api.toTrainingRecord
import com.fitnessai.android.data.model.AnalysisResult
import com.fitnessai.android.data.model.AnalysisStatus
import com.fitnessai.android.data.model.ExerciseCatalogItem
import com.fitnessai.android.data.model.StatsSummary
import com.fitnessai.android.data.model.TrainingRecord
import kotlinx.coroutines.delay
import okhttp3.MultipartBody
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okio.BufferedSink
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import retrofit2.HttpException
import java.util.concurrent.ConcurrentHashMap

/**
 * Repositories below take a [ServicesProvider] so they always dispatch through the latest
 * [ApiServices] held by [com.fitnessai.android.core.config.ApiClientHolder]. When the user
 * changes BaseUrl in Settings, the next call automatically targets the new backend.
 */
typealias ServicesProvider = () -> ApiServices

private fun ServicesProvider.exercise(): ExerciseApiService = invoke().exercise
private fun ServicesProvider.stats(): StatsApiService = invoke().stats
private fun ServicesProvider.video(): VideoApiService = invoke().video
private fun ServicesProvider.poseAnalysis(): PoseAnalysisApiService = invoke().poseAnalysis
private fun ServicesProvider.poseScoring(): PoseScoringApiService = invoke().poseScoring

class ApiTrainingRecordRepository(
    private val services: ServicesProvider,
    private val baseUrlProvider: () -> String
) : TrainingRecordRepository, ExerciseCatalogRepository {
    private val _records = MutableStateFlow<List<TrainingRecord>>(emptyList())
    override val records: StateFlow<List<TrainingRecord>> = _records
    private val _exercises = MutableStateFlow<List<ExerciseCatalogItem>>(emptyList())
    override val exercises: StateFlow<List<ExerciseCatalogItem>> = _exercises

    override suspend fun refresh(): Result<Unit> {
        return apiResult {
            val service = services.exercise()
            val baseUrl = baseUrlProvider()
            val exerciseDtos = service.getExercises()
            _exercises.value = exerciseDtos.map { it.toExerciseCatalogItem() }
            val exercisesById = exerciseDtos.associateBy { it.id }
            _records.value = service.getRecords(limit = 100).map { record ->
                record.toTrainingRecord(exercisesById[record.exerciseId], baseUrl)
            }
        }
    }

    override fun getRecord(id: String): TrainingRecord? {
        return _records.value.firstOrNull { it.id == id }
    }

    override fun replaceLocal(record: TrainingRecord) {
        _records.update { records ->
            records.map { current -> if (current.id == record.id) record else current }
        }
    }

    override suspend fun createRecord(record: TrainingRecord): Result<TrainingRecord> {
        return apiResult {
            val service = services.exercise()
            val baseUrl = baseUrlProvider()
            val exerciseId = record.requireBackendExerciseId()
            val created = service.createRecord(
                ExerciseRecordCreateDto(
                    exerciseId = exerciseId,
                    score = (record.score ?: 0).toDouble(),
                    count = record.count,
                    duration = record.durationSeconds ?: 0
                )
            ).toTrainingRecord(_exercises.value.firstOrNull { it.id == exerciseId.toString() }?.let {
                com.fitnessai.android.data.api.ExerciseDto(
                    id = exerciseId,
                    name = it.name,
                    category = it.category
                )
            }, baseUrl)
            _records.update { records -> listOf(created) + records.filterNot { it.id == created.id } }
            created
        }
    }

    override suspend fun updateRecord(record: TrainingRecord): Result<TrainingRecord> {
        return apiResult {
            val service = services.exercise()
            val baseUrl = baseUrlProvider()
            val recordId = record.requireBackendRecordId()
            val updated = service.updateRecord(
                recordId = recordId,
                record = ExerciseRecordUpdateDto(
                    score = record.score?.toDouble(),
                    count = record.count,
                    duration = record.durationSeconds
                )
            ).toTrainingRecord(_exercises.value.firstOrNull { it.id == record.exerciseId }?.let {
                com.fitnessai.android.data.api.ExerciseDto(
                    id = it.id.toInt(),
                    name = it.name,
                    category = it.category
                )
            }, baseUrl)
            _records.update { records -> records.map { if (it.id == updated.id) updated else it } }
            updated
        }
    }

    override suspend fun deleteRecord(id: String): Result<Unit> {
        return apiResult {
            services.exercise().deleteRecord(
                id.toIntOrNull() ?: throw ApiRequestException(
                    kind = ApiErrorKind.Validation,
                    message = "后端记录 ID 无效"
                )
            )
            _records.update { records -> records.filterNot { it.id == id } }
        }
    }

    private fun TrainingRecord.requireBackendExerciseId(): Int {
        return exerciseId?.toIntOrNull() ?: throw ApiRequestException(
            kind = ApiErrorKind.Validation,
            message = "请选择后端动作"
        )
    }

    private fun TrainingRecord.requireBackendRecordId(): Int {
        return id.toIntOrNull() ?: throw ApiRequestException(
            kind = ApiErrorKind.Validation,
            message = "后端记录 ID 无效"
        )
    }
}

fun interface VideoContentProvider {
    fun read(uri: android.net.Uri): VideoContent
}

data class VideoContent(
    val body: RequestBody,
    val mimeType: String = "video/mp4",
    val fileName: String = "training-video.mp4"
) {
    companion object {
        fun fromBytes(
            bytes: ByteArray,
            mimeType: String = "video/mp4",
            fileName: String = "training-video.mp4"
        ): VideoContent {
            return VideoContent(
                body = bytes.toRequestBody(mimeType.toMediaTypeOrNull()),
                mimeType = mimeType,
                fileName = fileName
            )
        }

        fun streaming(
            mimeType: String = "video/mp4",
            fileName: String = "training-video.mp4",
            writer: (BufferedSink) -> Unit
        ): VideoContent {
            val requestBody = object : RequestBody() {
                override fun contentType() = mimeType.toMediaTypeOrNull()
                override fun writeTo(sink: BufferedSink) = writer(sink)
            }
            return VideoContent(body = requestBody, mimeType = mimeType, fileName = fileName)
        }
    }
}

class ApiVideoRepository(
    private val services: ServicesProvider,
    private val records: TrainingRecordRepository,
    private val analysis: AnalysisRepository,
    private val contentProvider: VideoContentProvider
) : VideoRepository {
    override suspend fun attachVideo(recordId: String, uri: android.net.Uri): Result<Unit> {
        return attachVideoContent(recordId, contentProvider.read(uri))
    }

    suspend fun attachVideoContent(recordId: String, content: VideoContent): Result<Unit> {
        return apiResult {
            val backendRecordId = recordId.toIntOrNull() ?: throw ApiRequestException(
                kind = ApiErrorKind.Validation,
                message = "后端记录 ID 无效"
            )
            val part = MultipartBody.Part.createFormData("video", content.fileName, content.body)
            services.video().uploadVideo(recordId = backendRecordId, video = part)
            analysis.clearAnalysis(recordId)
            records.refresh().getOrThrow()
        }
    }
}

data class ApiAnalysisPollingConfig(
    val intervalMillis: Long = 1_000,
    val maxAttempts: Int = 30
)

class ApiPoseAnalysisRepository(
    private val services: ServicesProvider,
    private val records: TrainingRecordRepository,
    private val notifications: NotificationScheduler,
    private val applicationScope: CoroutineScope = CoroutineScope(SupervisorJob()),
    private val polling: ApiAnalysisPollingConfig = ApiAnalysisPollingConfig()
) : AnalysisRepository {
    private val json = Json { ignoreUnknownKeys = true }

    /** Active poll jobs keyed by recordId — allows cancellation & reconnection. */
    private val pollJobs = ConcurrentHashMap<String, Job>()

    override suspend fun startAnalysis(recordId: String): Result<Unit> {
        return apiResult {
            val record = records.getRecord(recordId) ?: throw ApiRequestException(
                kind = ApiErrorKind.NotFound,
                message = "记录不存在"
            )
            if (record.hasActiveAnalysis) {
                throw ApiRequestException(
                    kind = ApiErrorKind.Validation,
                    message = "分析正在进行中"
                )
            }
            val backendRecordId = recordId.toIntOrNull() ?: throw ApiRequestException(
                kind = ApiErrorKind.Validation,
                message = "后端记录 ID 无效"
            )
            // Analysis lifecycle is local UI state; only scoring explicitly updates the record.
            records.replaceLocal(
                record.copy(analysisResult = AnalysisResult(AnalysisStatus.Queued))
            )

            // Create backend job
            val job = services.poseAnalysis().createPoseAnalysisJob(
                backendRecordId, PoseAnalysisTriggerDto()
            )
            records.getRecord(recordId)?.let {
                records.replaceLocal(
                    it.copy(
                        analysisResult = AnalysisResult(
                            status = AnalysisStatus.Running,
                            jobId = job.id
                        )
                    )
                )
            }

            launchPolling(recordId, backendRecordId, job.id)
        }
    }

    override suspend fun resumeAnalysis(recordId: String): Result<Unit> {
        return apiResult {
            val record = records.getRecord(recordId) ?: throw ApiRequestException(
                kind = ApiErrorKind.NotFound,
                message = "记录不存在"
            )
            val backendRecordId = recordId.toIntOrNull() ?: throw ApiRequestException(
                kind = ApiErrorKind.Validation,
                message = "后端记录 ID 无效"
            )
            val latestResponse = services.poseAnalysis().getLatestPoseAnalysisJob(backendRecordId)
            if (!latestResponse.isSuccessful) {
                throw HttpException(latestResponse)
            }
            // The backend represents "no job" as the top-level JSON literal null.
            // Read it explicitly because the Retrofit serializer expects an object.
            val latestJson = latestResponse.body()?.string()?.trim()
            val latest = if (latestJson.isNullOrEmpty() || latestJson == "null") {
                null
            } else {
                json.decodeFromString<com.fitnessai.android.data.api.PoseAnalysisJobDto>(
                    latestJson
                )
            }
            if (latest == null) {
                cancelAnalysis(recordId)
                records.replaceLocal(
                    record.copy(analysisResult = AnalysisResult(AnalysisStatus.Idle))
                )
                return@apiResult
            }

            records.replaceLocal(
                record.copy(
                    analysisResult = AnalysisResult(
                        status = latest.status.normalizedJobStatus(),
                        jobId = latest.id,
                        message = latest.error
                    )
                )
            )
            launchPolling(recordId, backendRecordId, latest.id)
        }
    }

    private fun launchPolling(recordId: String, backendRecordId: Int, jobId: Int) {
        pollJobs.remove(recordId)?.cancel()

        // Register the lazy job before it can finish, otherwise a very fast response can
        // leave a completed job in pollJobs after its finally block has already run.
        val pollJob = applicationScope.launch(start = CoroutineStart.LAZY) {
            pollAndFetchResult(recordId, backendRecordId, jobId)
        }
        pollJobs[recordId] = pollJob
        pollJob.start()
    }

    /** Cancel a running analysis for the given record. */
    fun cancelAnalysis(recordId: String) {
        pollJobs.remove(recordId)?.cancel()
    }

    override fun clearAnalysis(recordId: String) {
        cancelAnalysis(recordId)
        records.getRecord(recordId)?.let {
            records.replaceLocal(it.copy(analysisResult = AnalysisResult(AnalysisStatus.Idle)))
        }
    }

    private suspend fun pollAndFetchResult(recordId: String, backendRecordId: Int, jobId: Int) {
        try {
            val terminal = pollJob(jobId)
            when (terminal.status.normalizedJobStatus()) {
                AnalysisStatus.Completed -> {
                    val result = services.poseAnalysis().getPoseAnalysis(backendRecordId)
                        .toAnalysisResult()
                    val completed = requireNotNull(records.getRecord(recordId))
                        .copy(analysisResult = result.copy(jobId = jobId))
                    records.replaceLocal(completed)
                    if (result.status == AnalysisStatus.Completed) {
                        runCatching { notifications.notifyAnalysisComplete(completed) }
                    }
                }
                AnalysisStatus.Failed -> {
                    records.getRecord(recordId)?.let {
                        // Failure is analysis UI state, not an editable exercise measurement.
                        records.replaceLocal(
                            it.copy(
                                analysisResult = AnalysisResult(
                                    status = AnalysisStatus.Failed,
                                    jobId = jobId,
                                    message = terminal.error ?: "分析失败"
                                )
                            )
                        )
                    }
                }
                else -> Unit
            }
        } catch (_: kotlinx.coroutines.CancellationException) {
            // Swallow cancellation — the UI will reconnect via resumeAnalysis.
        } catch (e: Exception) {
            records.getRecord(recordId)?.let {
                records.replaceLocal(
                    it.copy(
                        analysisResult = AnalysisResult(
                            status = AnalysisStatus.Failed,
                            jobId = jobId,
                            message = e.message ?: "分析失败"
                        )
                    )
                )
            }
        } finally {
            currentCoroutineContext()[Job]?.let { currentJob ->
                // Do not let an older cancelled poll remove a newer poll for the same record.
                pollJobs.remove(recordId, currentJob)
            }
        }
    }

    private suspend fun pollJob(jobId: Int): com.fitnessai.android.data.api.PoseAnalysisJobDto {
        repeat(polling.maxAttempts) { attempt ->
            val job = services.poseAnalysis().getPoseAnalysisJob(jobId)
            when (job.status.normalizedJobStatus()) {
                AnalysisStatus.Completed,
                AnalysisStatus.Failed -> return job
                else -> if (attempt < polling.maxAttempts - 1 && polling.intervalMillis > 0) {
                    delay(polling.intervalMillis)
                }
            }
        }
        throw ApiRequestException(
            kind = ApiErrorKind.Unexpected,
            message = "分析超时，请稍后重试"
        )
    }

    private fun String.normalizedJobStatus(): AnalysisStatus {
        return when (lowercase()) {
            "queued", "pending" -> AnalysisStatus.Queued
            "running", "processing", "started" -> AnalysisStatus.Running
            "done", "completed", "success", "succeeded" -> AnalysisStatus.Completed
            "failed", "error", "cancelled" -> AnalysisStatus.Failed
            else -> AnalysisStatus.Running
        }
    }
}

class ApiStatsRepository(
    private val services: ServicesProvider
) : StatsRepository {
    private val _stats = MutableStateFlow(StatsSummary(0, 0, 0, null))
    override val stats: StateFlow<StatsSummary> = _stats

    private val _weekly = MutableStateFlow<List<WeeklyStatsDto>>(emptyList())
    val weekly: StateFlow<List<WeeklyStatsDto>> = _weekly

    override suspend fun refresh(): Result<Unit> {
        return apiResult {
            _stats.value = services.stats().getSummary().toStatsSummary()
        }
    }

    suspend fun refreshWeekly(): Result<List<WeeklyStatsDto>> {
        return apiResult {
            val list = services.stats().getWeeklyStats()
            _weekly.value = list
            list
        }
    }
}

class ApiScoringAnalysisRepository(
    private val services: ServicesProvider,
    private val records: TrainingRecordRepository,
    private val delegate: AnalysisRepository
) : AnalysisRepository {
    override suspend fun startAnalysis(recordId: String): Result<Unit> {
        return delegate.startAnalysis(recordId)
    }

    override suspend fun resumeAnalysis(recordId: String): Result<Unit> {
        return delegate.resumeAnalysis(recordId)
    }

    override suspend fun scorePose(recordId: String, apply: Boolean): Result<Unit> {
        return apiResult {
            val numericRecordId = recordId.toIntOrNull() ?: throw ApiRequestException(
                kind = ApiErrorKind.Validation,
                message = "后端记录 ID 无效"
            )
            val result = services.poseScoring().scorePose(numericRecordId, PoseScoringRequestDto(apply = apply))
            val analysis = result.toAnalysisResult()
            if (analysis.status == AnalysisStatus.Failed) {
                throw ApiRequestException(
                    kind = ApiErrorKind.Validation,
                    message = analysis.message ?: "评分未完成"
                )
            }
            records.getRecord(recordId)?.let { current ->
                records.replaceLocal(current.copy(analysisResult = analysis))
            }
        }
    }

    override fun clearAnalysis(recordId: String) {
        delegate.clearAnalysis(recordId)
    }
}
