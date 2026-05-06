package com.fitnessai.android.app

import android.app.Application
import android.net.Uri
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.fitnessai.android.data.model.RecordDraft
import com.fitnessai.android.data.model.StatsSummary
import com.fitnessai.android.data.model.TrainingRecord
import com.fitnessai.android.data.model.UserRole
import com.fitnessai.android.data.model.UserSession
import com.fitnessai.android.data.repository.AppRepositoryContainer
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class FitnessAiViewModel(application: Application) : AndroidViewModel(application) {
    private val repositories = AppRepositoryContainer.create(application)
    private val authRepository = repositories.authRepository
    private val recordRepository = repositories.recordRepository
    private val statsRepository = repositories.statsRepository
    private val analysisRepository = repositories.analysisRepository
    private val videoRepository = repositories.videoRepository

    val session: StateFlow<UserSession?> = authRepository.session
    val records: StateFlow<List<TrainingRecord>> = recordRepository.records
    val stats: StateFlow<StatsSummary> = statsRepository.stats

    val homeState: StateFlow<HomeState> = combine(records, stats) { records, stats ->
        HomeState(
            summary = stats,
            recentRecords = records.take(3)
        )
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = HomeState(StatsSummary(0, 0, 0, null), emptyList())
    )

    init {
        viewModelScope.launch {
            val result = authRepository.bootstrap()
            if (result.isSuccess && session.value != null) {
                refreshReadData()
            }
        }
    }

    fun login(username: String, password: String, onResult: (String?) -> Unit) {
        viewModelScope.launch {
            val result = authRepository.login(username, password)
            if (result.isSuccess) {
                refreshReadData()
            }
            onResult(result.exceptionOrNull()?.message)
        }
    }

    fun selectRole(role: UserRole) {
        authRepository.selectRole(role)
    }

    fun logout() {
        viewModelScope.launch {
            authRepository.logout()
        }
    }

    fun getRecord(id: String): TrainingRecord? = recordRepository.getRecord(id)

    fun createRecord(draft: RecordDraft): String? {
        val record = draft.toRecordOrNull() ?: return null
        recordRepository.createRecord(record)
        viewModelScope.launch { statsRepository.refresh() }
        return record.id
    }

    fun updateRecord(id: String, draft: RecordDraft): Boolean {
        val current = recordRepository.getRecord(id) ?: return false
        val next = draft.toRecordOrNull(existing = current) ?: return false
        recordRepository.updateRecord(next)
        viewModelScope.launch { statsRepository.refresh() }
        return true
    }

    fun deleteRecord(id: String) {
        recordRepository.deleteRecord(id)
        viewModelScope.launch { statsRepository.refresh() }
    }

    fun attachVideo(recordId: String, uri: Uri) {
        videoRepository.attachVideo(recordId, uri)
    }

    fun startAnalysis(recordId: String, onResult: (String?) -> Unit) {
        viewModelScope.launch {
            val result = analysisRepository.startAnalysis(recordId)
            onResult(result.exceptionOrNull()?.message)
        }
    }

    private fun RecordDraft.toRecordOrNull(existing: TrainingRecord? = null): TrainingRecord? {
        val parsedCount = count.toIntOrNull()
        if (exerciseName.isBlank() || category.isBlank() || parsedCount == null || parsedCount < 0) {
            return null
        }
        return TrainingRecord(
            id = existing?.id ?: java.util.UUID.randomUUID().toString(),
            exerciseName = exerciseName.trim(),
            category = category.trim(),
            count = parsedCount,
            score = score.toIntOrNull(),
            durationSeconds = durationSeconds.toIntOrNull(),
            recordedAt = existing?.recordedAt ?: java.time.LocalDateTime.now(),
            videoUri = existing?.videoUri,
            analysisResult = existing?.analysisResult ?: com.fitnessai.android.data.model.AnalysisResult(
                com.fitnessai.android.data.model.AnalysisStatus.Idle
            )
        )
    }

    private suspend fun refreshReadData() {
        recordRepository.refresh()
        statsRepository.refresh()
    }
}

data class HomeState(
    val summary: StatsSummary,
    val recentRecords: List<TrainingRecord>
)
