package com.fitnessai.android.ui.stats

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.fitnessai.android.data.api.WeeklyStatsDto
import com.fitnessai.android.data.model.StatsSummary
import com.fitnessai.android.data.model.TrainingRecord
import com.fitnessai.android.data.repository.ApiStatsRepository
import com.fitnessai.android.data.repository.TrainingRecordRepository
import com.fitnessai.android.ui.components.StatsBucket
import com.fitnessai.android.ui.components.StatsPeriod
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class StatsUiState(
    val summary: StatsSummary,
    val period: StatsPeriod,
    val buckets: List<StatsBucket>,
    val weeklyError: String? = null,
    val refreshing: Boolean = false
)

/**
 * Bucket builder for the chart used by [StatsScreen]. Pulls week buckets from the backend's
 * /stats/weekly endpoint (when available) and falls back to deriving month/year buckets from
 * already-loaded [TrainingRecord]s. Empty data renders the empty illustration in the chart.
 */
class StatsViewModel(
    private val statsRepository: ApiStatsRepository,
    private val recordRepository: TrainingRecordRepository
) : ViewModel() {
    private val _period = MutableStateFlow(StatsPeriod.Week)
    val period: StateFlow<StatsPeriod> = _period

    private val _weeklyError = MutableStateFlow<String?>(null)
    val weeklyError: StateFlow<String?> = _weeklyError

    private val _refreshing = MutableStateFlow(false)
    val refreshing: StateFlow<Boolean> = _refreshing

    init {
        // Load data once on creation; subsequent refreshes are user-triggered
        refreshAll()
    }

    val state: StateFlow<StatsUiState> = combine(
        statsRepository.stats,
        statsRepository.weekly,
        recordRepository.records,
        _period,
        _weeklyError
    ) { summary, weekly, records, period, weeklyError ->
        StatsUiState(
            summary = summary,
            period = period,
            buckets = when (period) {
                StatsPeriod.Week -> weekly.toWeekBuckets()
                StatsPeriod.Month -> records.toMonthBuckets()
                StatsPeriod.Year -> records.toYearBuckets()
            },
            weeklyError = weeklyError.takeIf { period == StatsPeriod.Week },
            refreshing = _refreshing.value
        )
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = StatsUiState(
            summary = StatsSummary(0, 0, 0, null),
            period = StatsPeriod.Week,
            buckets = emptyList()
        )
    )

    fun selectPeriod(period: StatsPeriod) {
        if (_period.value == period) return
        _period.value = period
        if (period == StatsPeriod.Week) refreshWeekly()
    }

    fun refreshAll() {
        viewModelScope.launch {
            _refreshing.value = true
            statsRepository.refresh()
            recordRepository.refresh()
            if (_period.value == StatsPeriod.Week) refreshWeekly()
            _refreshing.value = false
        }
    }

    fun refreshWeekly() {
        viewModelScope.launch {
            val result = statsRepository.refreshWeekly()
            _weeklyError.value = result.exceptionOrNull()?.message
        }
    }

    private fun List<WeeklyStatsDto>.toWeekBuckets(): List<StatsBucket> {
        if (isEmpty()) return emptyList()
        val formatter = DateTimeFormatter.ofPattern("MM/dd")
        return takeLast(7).map { dto ->
            val parsed = runCatching { LocalDate.parse(dto.date) }.getOrNull()
            StatsBucket(
                label = parsed?.format(formatter) ?: dto.date,
                sessions = dto.sessions
            )
        }
    }

    private fun List<TrainingRecord>.toMonthBuckets(): List<StatsBucket> {
        val today = LocalDate.now()
        val byDate = groupBy { it.recordedAt.toLocalDate() }
        return (29 downTo 0).map { offset ->
            val date = today.minusDays(offset.toLong())
            val sessions = byDate[date]?.size ?: 0
            val label = if (offset % 5 == 0) date.dayOfMonth.toString() else ""
            StatsBucket(label = label, sessions = sessions)
        }
    }

    private fun List<TrainingRecord>.toYearBuckets(): List<StatsBucket> {
        val today = LocalDate.now()
        val byMonth = groupBy { it.recordedAt.year * 100 + it.recordedAt.monthValue }
        return (11 downTo 0).map { offset ->
            val month = today.minusMonths(offset.toLong())
            val key = month.year * 100 + month.monthValue
            val sessions = byMonth[key]?.size ?: 0
            StatsBucket(label = "${month.monthValue}月", sessions = sessions)
        }
    }

    class Factory(
        private val statsRepository: ApiStatsRepository,
        private val recordRepository: TrainingRecordRepository
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            return StatsViewModel(statsRepository, recordRepository) as T
        }
    }
}
