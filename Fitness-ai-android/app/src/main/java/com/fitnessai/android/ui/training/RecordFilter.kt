package com.fitnessai.android.ui.training

import com.fitnessai.android.data.model.TrainingRecord

const val ALL_CATEGORIES = "全部"

data class FilterState(
    val query: String = "",
    val category: String = ALL_CATEGORIES,
    val sort: SortOrder = SortOrder.DateDesc
)

enum class SortOrder(val label: String) {
    DateDesc("日期降序"),
    DateAsc("日期升序"),
    ScoreDesc("分数降序")
}

object RecordFilter {
    fun apply(records: List<TrainingRecord>, state: FilterState): List<TrainingRecord> {
        val query = state.query.trim().lowercase()
        return records
            .asSequence()
            .filter { state.category == ALL_CATEGORIES || it.category == state.category }
            .filter { query.isEmpty() || it.exerciseName.lowercase().contains(query) }
            .toList()
            .let { filtered ->
                when (state.sort) {
                    SortOrder.DateDesc -> filtered.sortedByDescending { it.recordedAt }
                    SortOrder.DateAsc -> filtered.sortedBy { it.recordedAt }
                    SortOrder.ScoreDesc -> filtered.sortedWith(
                        compareByDescending<TrainingRecord> { it.score != null }
                            .thenByDescending { it.score ?: Int.MIN_VALUE }
                    )
                }
            }
    }
}
