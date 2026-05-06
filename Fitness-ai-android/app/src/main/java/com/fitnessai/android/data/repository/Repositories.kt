package com.fitnessai.android.data.repository

import android.net.Uri
import com.fitnessai.android.data.model.AnalysisResult
import com.fitnessai.android.data.model.StatsSummary
import com.fitnessai.android.data.model.TrainingRecord
import com.fitnessai.android.data.model.UserRole
import com.fitnessai.android.data.model.UserSession
import kotlinx.coroutines.flow.StateFlow

interface AuthRepository {
    val session: StateFlow<UserSession?>
    suspend fun bootstrap(): Result<Unit> = Result.success(Unit)
    suspend fun login(username: String, password: String): Result<Unit>
    fun selectRole(role: UserRole)
    suspend fun logout()
}

interface TrainingRecordRepository {
    val records: StateFlow<List<TrainingRecord>>
    suspend fun refresh(): Result<Unit> = Result.success(Unit)
    fun getRecord(id: String): TrainingRecord?
    fun createRecord(record: TrainingRecord)
    fun updateRecord(record: TrainingRecord)
    fun deleteRecord(id: String)
}

interface StatsRepository {
    val stats: StateFlow<StatsSummary>
    suspend fun refresh(): Result<Unit>
}

interface VideoRepository {
    fun attachVideo(recordId: String, uri: Uri)
}

interface AnalysisRepository {
    suspend fun startAnalysis(recordId: String): Result<Unit>
    suspend fun scorePose(recordId: String, apply: Boolean): Result<Unit> = Result.failure(
        UnsupportedOperationException("当前模式不支持后端评分")
    )
    fun clearAnalysis(recordId: String)
}

interface NotificationScheduler {
    fun notifyAnalysisComplete(record: TrainingRecord)
}
