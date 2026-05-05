package com.fitnessai.android.data.repository

import com.fitnessai.android.data.model.TrainingRecord
import com.fitnessai.android.data.model.UserRole
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class InMemoryRepositoriesTest {
    @Test
    fun loginStoresSessionAndRole() = runTest {
        val repository = InMemoryAuthRepository()

        val result = repository.login("tester", "1234")
        repository.selectRole(UserRole.Student)

        assertTrue(result.isSuccess)
        assertEquals("tester", repository.session.value?.displayName)
        assertEquals(UserRole.Student, repository.session.value?.role)
    }

    @Test
    fun recordsCanBeCreatedUpdatedAndDeleted() {
        val repository = InMemoryTrainingRecordRepository()
        val record = TrainingRecord(
            exerciseName = "跳绳",
            category = "有氧",
            count = 100
        )

        repository.createRecord(record)
        repository.updateRecord(record.copy(score = 90))
        val updated = repository.getRecord(record.id)
        repository.deleteRecord(record.id)

        assertNotNull(updated)
        assertEquals(90, updated?.score)
        assertEquals(null, repository.getRecord(record.id))
    }
}
