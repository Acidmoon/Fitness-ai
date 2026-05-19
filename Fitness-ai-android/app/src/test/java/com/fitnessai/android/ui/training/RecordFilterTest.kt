package com.fitnessai.android.ui.training

import com.fitnessai.android.data.model.TrainingRecord
import java.time.LocalDateTime
import org.junit.Assert.assertEquals
import org.junit.Test

class RecordFilterTest {
    private val records = listOf(
        TrainingRecord(
            id = "1",
            exerciseName = "Push Up",
            category = "上肢",
            count = 10,
            score = 80,
            recordedAt = LocalDateTime.parse("2026-05-01T10:00:00")
        ),
        TrainingRecord(
            id = "2",
            exerciseName = "Squat",
            category = "下肢",
            count = 20,
            score = null,
            recordedAt = LocalDateTime.parse("2026-05-02T10:00:00")
        ),
        TrainingRecord(
            id = "3",
            exerciseName = "push press",
            category = "上肢",
            count = 8,
            score = 95,
            recordedAt = LocalDateTime.parse("2026-05-03T10:00:00")
        )
    )

    @Test
    fun searchIsCaseInsensitiveSubstring() {
        val result = RecordFilter.apply(records, FilterState(query = "PUSH"))

        assertEquals(listOf("3", "1"), result.map { it.id })
    }

    @Test
    fun categoryAndScoreSortCanBeCombined() {
        val result = RecordFilter.apply(
            records,
            FilterState(category = "上肢", sort = SortOrder.ScoreDesc)
        )

        assertEquals(listOf("3", "1"), result.map { it.id })
    }

    @Test
    fun dateAscendingSortsOldestFirst() {
        val result = RecordFilter.apply(records, FilterState(sort = SortOrder.DateAsc))

        assertEquals(listOf("1", "2", "3"), result.map { it.id })
    }
}
