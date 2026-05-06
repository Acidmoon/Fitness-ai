package com.fitnessai.android.data.repository

import android.net.Uri
import com.fitnessai.android.data.model.AnalysisResult
import com.fitnessai.android.data.model.TrainingRecord
import com.fitnessai.android.data.model.UserRole
import com.fitnessai.android.data.model.UserSession
import kotlinx.coroutines.flow.StateFlow

interface AuthRepository {
    val session: StateFlow<UserSession?>
    suspend fun login(username: String, password: String): Result<Unit>
    fun selectRole(role: UserRole)
    suspend fun logout()
}

interface TrainingRecordRepository {
    val records: StateFlow<List<TrainingRecord>>
    fun getRecord(id: String): TrainingRecord?
    fun createRecord(record: TrainingRecord)
    fun updateRecord(record: TrainingRecord)
    fun deleteRecord(id: String)
}

interface VideoRepository {
    fun attachVideo(recordId: String, uri: Uri)
}

interface AnalysisRepository {
    suspend fun startAnalysis(recordId: String): Result<Unit>
    fun clearAnalysis(recordId: String)
}

interface NotificationScheduler {
    fun notifyAnalysisComplete(record: TrainingRecord)
}
