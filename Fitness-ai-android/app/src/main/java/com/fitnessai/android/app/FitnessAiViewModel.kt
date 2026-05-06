package com.fitnessai.android.app

import android.app.Application
import android.net.Uri
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.fitnessai.android.data.api.ApiErrorKind
import com.fitnessai.android.data.api.ApiRequestException
import com.fitnessai.android.data.config.AppBackendConfiguration
import com.fitnessai.android.data.config.BackendMode
import com.fitnessai.android.data.model.RecordDraft
import com.fitnessai.android.data.model.StatsSummary
import com.fitnessai.android.data.model.TrainingRecord
import com.fitnessai.android.data.model.UserRole
import com.fitnessai.android.data.model.UserSession
import com.fitnessai.android.data.repository.AppRepositoryContainer
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class FitnessAiViewModel(application: Application) : AndroidViewModel(application) {
    private val configuration = AppBackendConfiguration.fromBuildConfig()
    private val isApiMode = configuration.mode == BackendMode.Api
    private val repositories = AppRepositoryContainer.create(application, configuration)
    private val authRepository = repositories.authRepository
    private val recordRepository = repositories.recordRepository
    private val statsRepository = repositories.statsRepository
    private val analysisRepository = repositories.analysisRepository
    private val videoRepository = repositories.videoRepository

    val session: StateFlow<UserSession?> = authRepository.session
    val records: StateFlow<List<TrainingRecord>> = recordRepository.records
    val stats: StateFlow<StatsSummary> = statsRepository.stats
    private val _recordsOperation = MutableStateFlow(initialReadState())
    val recordsOperation: StateFlow<ApiOperationState> = _recordsOperation
    private val _statsOperation = MutableStateFlow(initialReadState())
    val statsOperation: StateFlow<ApiOperationState> = _statsOperation
    private val _recordActionState = MutableStateFlow(RecordActionState())
    val recordActionState: StateFlow<RecordActionState> = _recordActionState

    val homeState: StateFlow<HomeState> = combine(
        records,
        stats,
        recordsOperation,
        statsOperation
    ) { records, stats, recordsOperation, statsOperation ->
        HomeState(
            summary = stats,
            recentRecords = records.take(3),
            operation = mergeHomeOperation(recordsOperation, statsOperation, records, stats)
        )
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = HomeState(StatsSummary(0, 0, 0, null), emptyList(), initialReadState())
    )

    init {
        viewModelScope.launch {
            val result = authRepository.bootstrap()
            if (result.isSuccess && session.value != null) {
                refreshReadData()
            } else if (isApiMode && session.value == null) {
                _recordsOperation.value = ApiOperationState.Unauthenticated
                _statsOperation.value = ApiOperationState.Unauthenticated
            }
        }
    }

    fun login(username: String, password: String, onResult: (String?) -> Unit) {
        viewModelScope.launch {
            val result = authRepository.login(username, password)
            if (result.isSuccess) {
                refreshReadData()
            } else if (isApiMode) {
                _recordsOperation.value = ApiOperationState.Unauthenticated
                _statsOperation.value = ApiOperationState.Unauthenticated
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
            _recordsOperation.value = ApiOperationState.Unauthenticated
            _statsOperation.value = ApiOperationState.Unauthenticated
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
        _recordActionState.value = RecordActionState(uploadingVideo = true)
        runCatching {
            videoRepository.attachVideo(recordId, uri)
        }.onFailure { throwable ->
            _recordActionState.value = RecordActionState(errorMessage = throwable.userMessage())
            return
        }
        _recordActionState.value = RecordActionState()
    }

    fun startAnalysis(recordId: String, onResult: (String?) -> Unit) {
        viewModelScope.launch {
            if (_recordActionState.value.isBusy) {
                onResult("操作正在进行中")
                return@launch
            }
            _recordActionState.value = RecordActionState(analyzing = true)
            val result = analysisRepository.startAnalysis(recordId)
            val error = result.exceptionOrNull()?.userMessage()
            _recordActionState.value = RecordActionState(errorMessage = error)
            onResult(error)
        }
    }

    fun refreshHome() {
        viewModelScope.launch { refreshReadData() }
    }

    fun refreshRecords() {
        viewModelScope.launch { refreshRecordsInternal(refreshing = true) }
    }

    fun refreshStats() {
        viewModelScope.launch { refreshStatsInternal(refreshing = true) }
    }

    fun retryAnalysis(recordId: String, onResult: (String?) -> Unit) {
        startAnalysis(recordId, onResult)
    }

    fun clearRecordActionError() {
        if (!_recordActionState.value.isBusy) {
            _recordActionState.value = RecordActionState()
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
        refreshRecordsInternal(refreshing = true)
        refreshStatsInternal(refreshing = true)
    }

    private suspend fun refreshRecordsInternal(refreshing: Boolean) {
        if (isApiMode) {
            _recordsOperation.value = if (refreshing && records.value.isNotEmpty()) {
                ApiOperationState.Refreshing
            } else {
                ApiOperationState.Loading
            }
        }
        val result = recordRepository.refresh()
        _recordsOperation.value = operationAfter(result, records.value.isEmpty())
    }

    private suspend fun refreshStatsInternal(refreshing: Boolean) {
        if (isApiMode) {
            _statsOperation.value = if (refreshing && stats.value.totalRecords > 0) {
                ApiOperationState.Refreshing
            } else {
                ApiOperationState.Loading
            }
        }
        val result = statsRepository.refresh()
        _statsOperation.value = operationAfter(result, stats.value.totalRecords == 0)
    }

    private fun operationAfter(result: Result<Unit>, empty: Boolean): ApiOperationState {
        if (!isApiMode) return ApiOperationState.Ready
        return result.fold(
            onSuccess = { if (empty) ApiOperationState.Empty else ApiOperationState.Ready },
            onFailure = { throwable ->
                if ((throwable as? ApiRequestException)?.kind == ApiErrorKind.Authentication) {
                    viewModelScope.launch { authRepository.logout() }
                    ApiOperationState.Unauthenticated
                } else {
                    ApiOperationState.RecoverableError(throwable.userMessage())
                }
            }
        )
    }

    private fun initialReadState(): ApiOperationState {
        return if (isApiMode) ApiOperationState.Loading else ApiOperationState.Ready
    }

    private fun Throwable.userMessage(): String {
        return message ?: "操作失败，请稍后重试"
    }
}

data class HomeState(
    val summary: StatsSummary,
    val recentRecords: List<TrainingRecord>,
    val operation: ApiOperationState = ApiOperationState.Ready
)

sealed interface ApiOperationState {
    data object Ready : ApiOperationState
    data object Loading : ApiOperationState
    data object Refreshing : ApiOperationState
    data object Empty : ApiOperationState
    data object Unauthenticated : ApiOperationState
    data class RecoverableError(val message: String) : ApiOperationState
}

data class RecordActionState(
    val saving: Boolean = false,
    val deleting: Boolean = false,
    val uploadingVideo: Boolean = false,
    val analyzing: Boolean = false,
    val scoring: Boolean = false,
    val errorMessage: String? = null
) {
    val isBusy: Boolean
        get() = saving || deleting || uploadingVideo || analyzing || scoring
}

private fun mergeHomeOperation(
    recordsOperation: ApiOperationState,
    statsOperation: ApiOperationState,
    records: List<TrainingRecord>,
    stats: StatsSummary
): ApiOperationState {
    val operations = listOf(recordsOperation, statsOperation)
    operations.firstOrNull { it is ApiOperationState.Unauthenticated }?.let { return it }
    operations.firstOrNull { it is ApiOperationState.RecoverableError }?.let { return it }
    operations.firstOrNull { it is ApiOperationState.Loading }?.let { return it }
    operations.firstOrNull { it is ApiOperationState.Refreshing }?.let { return it }
    return if (records.isEmpty() && stats.totalRecords == 0 && operations.any { it is ApiOperationState.Empty }) {
        ApiOperationState.Empty
    } else {
        ApiOperationState.Ready
    }
}
