package com.fitnessai.android.data.repository

import com.fitnessai.android.data.api.ExerciseApiService
import com.fitnessai.android.data.api.ApiErrorKind
import com.fitnessai.android.data.api.ApiRequestException
import com.fitnessai.android.data.api.VideoApiService
import com.fitnessai.android.data.api.ExerciseRecordCreateDto
import com.fitnessai.android.data.api.ExerciseRecordUpdateDto
import com.fitnessai.android.data.api.PoseScoringApiService
import com.fitnessai.android.data.api.PoseScoringRequestDto
import com.fitnessai.android.data.api.PoseAnalysisApiService
import com.fitnessai.android.data.api.PoseAnalysisTriggerDto
import com.fitnessai.android.data.api.StatsApiService
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
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import okio.BufferedSink
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update

class ApiTrainingRecordRepository(
    private val service: ExerciseApiService,
    private val baseUrl: String
) : TrainingRecordRepository, ExerciseCatalogRepository {
    private val _records = MutableStateFlow<List<TrainingRecord>>(emptyList())
    override val records: StateFlow<List<TrainingRecord>> = _records
    private val _exercises = MutableStateFlow<List<ExerciseCatalogItem>>(emptyList())
    override val exercises: StateFlow<List<ExerciseCatalogItem>> = _exercises

    override suspend fun refresh(): Result<Unit> {
        return apiResult {
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

    override suspend fun createRecord(record: TrainingRecord): Result<TrainingRecord> {
        return apiResult {
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
            service.deleteRecord(id.toIntOrNull() ?: throw ApiRequestException(
                kind = ApiErrorKind.Validation,
                message = "后端记录 ID 无效"
            ))
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
    private val service: VideoApiService,
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
            service.uploadVideo(recordId = backendRecordId, video = part)
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
    private val service: PoseAnalysisApiService,
    private val records: TrainingRecordRepository,
    private val notifications: NotificationScheduler,
    private val polling: ApiAnalysisPollingConfig = ApiAnalysisPollingConfig()
) : AnalysisRepository {
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
            records.updateRecord(record.copy(analysisResult = AnalysisResult(AnalysisStatus.Queued))).getOrThrow()
            val job = service.createPoseAnalysisJob(backendRecordId, PoseAnalysisTriggerDto())
            records.getRecord(recordId)?.let {
                records.updateRecord(it.copy(analysisResult = AnalysisResult(AnalysisStatus.Running))).getOrThrow()
            }
            val terminal = pollJob(job.id)
            when (terminal.status.normalizedJobStatus()) {
                AnalysisStatus.Completed -> {
                    val result = service.getPoseAnalysis(backendRecordId).toAnalysisResult()
                    val completed = requireNotNull(records.getRecord(recordId)).copy(analysisResult = result)
                    records.updateRecord(completed).getOrThrow()
                    if (result.status == AnalysisStatus.Completed) {
                        runCatching { notifications.notifyAnalysisComplete(completed) }
                    }
                }
                AnalysisStatus.Failed -> {
                    records.getRecord(recordId)?.let {
                        records.updateRecord(
                            it.copy(
                                analysisResult = AnalysisResult(
                                    status = AnalysisStatus.Failed,
                                    message = terminal.error ?: "分析失败"
                                )
                            )
                        ).getOrThrow()
                    }
                    throw ApiRequestException(
                        kind = ApiErrorKind.Unexpected,
                        message = terminal.error ?: "分析失败"
                    )
                }
                else -> Unit
            }
        }
    }

    override fun clearAnalysis(recordId: String) {
        records.getRecord(recordId)?.let {
            records.replaceRecord(it.copy(analysisResult = AnalysisResult(AnalysisStatus.Idle)))
        }
    }

    private suspend fun pollJob(jobId: Int): com.fitnessai.android.data.api.PoseAnalysisJobDto {
        repeat(polling.maxAttempts) { attempt ->
            val job = service.getPoseAnalysisJob(jobId)
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
    private val service: StatsApiService
) : StatsRepository {
    private val _stats = MutableStateFlow(StatsSummary(0, 0, 0, null))
    override val stats: StateFlow<StatsSummary> = _stats

    override suspend fun refresh(): Result<Unit> {
        return apiResult {
            _stats.value = service.getSummary().toStatsSummary()
        }
    }
}

class ApiScoringAnalysisRepository(
    private val service: PoseScoringApiService,
    private val records: TrainingRecordRepository,
    private val delegate: AnalysisRepository
) : AnalysisRepository {
    override suspend fun startAnalysis(recordId: String): Result<Unit> {
        return delegate.startAnalysis(recordId)
    }

    override suspend fun scorePose(recordId: String, apply: Boolean): Result<Unit> {
        return apiResult {
            val numericRecordId = recordId.toIntOrNull() ?: throw ApiRequestException(
                kind = ApiErrorKind.Validation,
                message = "后端记录 ID 无效"
            )
            val result = service.scorePose(numericRecordId, PoseScoringRequestDto(apply = apply))
            val analysis = result.toAnalysisResult()
            if (analysis.status == AnalysisStatus.Failed) {
                throw ApiRequestException(
                    kind = ApiErrorKind.Validation,
                    message = analysis.message ?: "评分未完成"
                )
            }
            records.getRecord(recordId)?.let { current ->
                records.updateRecord(current.copy(analysisResult = analysis))
            }
        }
    }

    override fun clearAnalysis(recordId: String) {
        delegate.clearAnalysis(recordId)
    }
}
