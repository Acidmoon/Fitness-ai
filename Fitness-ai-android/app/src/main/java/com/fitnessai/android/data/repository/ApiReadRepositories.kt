package com.fitnessai.android.data.repository

import com.fitnessai.android.data.api.ExerciseApiService
import com.fitnessai.android.data.api.ApiErrorKind
import com.fitnessai.android.data.api.ApiRequestException
import com.fitnessai.android.data.api.PoseScoringApiService
import com.fitnessai.android.data.api.PoseScoringRequestDto
import com.fitnessai.android.data.api.StatsApiService
import com.fitnessai.android.data.api.apiResult
import com.fitnessai.android.data.api.toAnalysisResult
import com.fitnessai.android.data.api.toStatsSummary
import com.fitnessai.android.data.api.toTrainingRecord
import com.fitnessai.android.data.model.AnalysisStatus
import com.fitnessai.android.data.model.StatsSummary
import com.fitnessai.android.data.model.TrainingRecord
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update

class ApiTrainingRecordRepository(
    private val service: ExerciseApiService
) : TrainingRecordRepository {
    private val _records = MutableStateFlow<List<TrainingRecord>>(emptyList())
    override val records: StateFlow<List<TrainingRecord>> = _records

    override suspend fun refresh(): Result<Unit> {
        return apiResult {
            val exercisesById = service.getExercises().associateBy { it.id }
            _records.value = service.getRecords(limit = 100).map { record ->
                record.toTrainingRecord(exercisesById[record.exerciseId])
            }
        }
    }

    override fun getRecord(id: String): TrainingRecord? {
        return _records.value.firstOrNull { it.id == id }
    }

    override fun createRecord(record: TrainingRecord) {
        _records.update { records -> listOf(record) + records }
    }

    override fun updateRecord(record: TrainingRecord) {
        _records.update { records -> records.map { if (it.id == record.id) record else it } }
    }

    override fun deleteRecord(id: String) {
        _records.update { records -> records.filterNot { it.id == id } }
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
