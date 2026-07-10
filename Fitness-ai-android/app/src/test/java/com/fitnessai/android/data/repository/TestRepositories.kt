package com.fitnessai.android.data.repository

import com.fitnessai.android.data.model.ExerciseCatalogItem
import com.fitnessai.android.data.model.StatsSummary
import com.fitnessai.android.data.model.TrainingRecord
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update

class InMemoryTrainingRecordRepository(
    initialRecords: List<TrainingRecord> = emptyList()
) : TrainingRecordRepository, ExerciseCatalogRepository {
    private val _records = MutableStateFlow(initialRecords)
    override val records: StateFlow<List<TrainingRecord>> = _records

    private val _exercises = MutableStateFlow(
        listOf(
            ExerciseCatalogItem("3", "俯卧撑", "上肢"),
            ExerciseCatalogItem("4", "深蹲", "下肢")
        )
    )
    override val exercises: StateFlow<List<ExerciseCatalogItem>> = _exercises

    override suspend fun refresh(): Result<Unit> = Result.success(Unit)

    override fun getRecord(id: String): TrainingRecord? {
        return _records.value.firstOrNull { it.id == id }
    }

    override fun replaceLocal(record: TrainingRecord) {
        _records.update { records -> records.map { if (it.id == record.id) record else it } }
    }

    override suspend fun createRecord(record: TrainingRecord): Result<TrainingRecord> {
        _records.update { records -> listOf(record) + records }
        return Result.success(record)
    }

    override suspend fun updateRecord(record: TrainingRecord): Result<TrainingRecord> {
        _records.update { records -> records.map { if (it.id == record.id) record else it } }
        return Result.success(record)
    }

    override suspend fun deleteRecord(id: String): Result<Unit> {
        _records.update { records -> records.filterNot { it.id == id } }
        return Result.success(Unit)
    }
}

class LocalStatsRepository(
    private val records: TrainingRecordRepository
) : StatsRepository {
    private val _stats = MutableStateFlow(calculate(records.records.value))
    override val stats: StateFlow<StatsSummary> = _stats

    override suspend fun refresh(): Result<Unit> {
        _stats.value = calculate(records.records.value)
        return Result.success(Unit)
    }

    private fun calculate(records: List<TrainingRecord>): StatsSummary {
        return StatsSummary(
            totalRecords = records.size,
            totalCount = records.sumOf { it.count },
            totalDurationSeconds = records.sumOf { it.durationSeconds ?: 0 },
            bestScore = records.mapNotNull { it.score }.maxOrNull()
        )
    }
}
