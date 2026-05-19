package com.fitnessai.android.app

import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.fitnessai.android.core.session.SessionEvent
import com.fitnessai.android.core.session.SessionManager
import com.fitnessai.android.core.snackbar.SnackbarController
import com.fitnessai.android.data.api.ApiErrorKind
import com.fitnessai.android.data.api.ApiRequestException
import com.fitnessai.android.data.model.RecordDraft
import com.fitnessai.android.data.model.StatsSummary
import com.fitnessai.android.data.model.TrainingRecord
import com.fitnessai.android.data.model.UserRole
import com.fitnessai.android.data.model.UserSession
import com.fitnessai.android.data.repository.AppRepositories
import com.fitnessai.android.ui.components.TrendPoint
import java.time.LocalDate
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

/**
 * Root view-model for the authenticated experience. Now driven entirely by the shared
 * [AppRepositories] instance from [AppContainer], so a Settings BaseUrl change immediately
 * affects all subsequent calls. Login/Register/Settings screens use their own dedicated
 * view-models; this one only tracks home/training/stats reads and analysis state.
 */
class FitnessAiViewModel(
    private val repositories: AppRepositories,
    private val sessionManager: SessionManager,
    private val snackbar: SnackbarController
) : ViewModel() {
    private val authRepository = repositories.authRepository
    private val recordRepository = repositories.recordRepository
    private val exerciseCatalogRepository = repositories.exerciseCatalogRepository
    private val statsRepository = repositories.statsRepository
    private val analysisRepository = repositories.analysisRepository
    private val videoRepository = repositories.videoRepository

    val session: StateFlow<UserSession?> = authRepository.session
    val records: StateFlow<List<TrainingRecord>> = recordRepository.records
    val exerciseCatalog = exerciseCatalogRepository.exercises
    val stats: StateFlow<StatsSummary> = statsRepository.stats

    private val _recordsOperation = MutableStateFlow<ApiOperationState>(ApiOperationState.Loading)
    val recordsOperation: StateFlow<ApiOperationState> = _recordsOperation
    private val _statsOperation = MutableStateFlow<ApiOperationState>(ApiOperationState.Loading)
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
            trendPoints = records.toTrendPoints(),
            operation = mergeHomeOperation(recordsOperation, statsOperation, records, stats)
        )
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = HomeState(StatsSummary(0, 0, 0, null), emptyList(), emptyList(), ApiOperationState.Loading)
    )

    init {
        viewModelScope.launch {
            val result = authRepository.bootstrap()
            if (result.isFailure) {
                val cause = result.exceptionOrNull()
                if ((cause as? ApiRequestException)?.kind == ApiErrorKind.Network) {
                    snackbar.warning("无法连接到服务器，请在设置中检查 API 地址")
                }
            }
            if (session.value != null) {
                refreshReadData()
            } else {
                _recordsOperation.value = ApiOperationState.Unauthenticated
                _statsOperation.value = ApiOperationState.Unauthenticated
            }
        }
        viewModelScope.launch {
            sessionManager.events.collect { event ->
                if (event is SessionEvent.NavigateToLogin) {
                    _recordsOperation.value = ApiOperationState.Unauthenticated
                    _statsOperation.value = ApiOperationState.Unauthenticated
                }
            }
        }
    }

    fun selectRole(role: UserRole) {
        authRepository.selectRole(role)
    }

    fun onLoggedIn() {
        viewModelScope.launch { refreshReadData() }
    }

    fun logout() {
        sessionManager.onManualLogout()
    }

    fun getRecord(id: String): TrainingRecord? = recordRepository.getRecord(id)

    fun createRecord(draft: RecordDraft, onResult: (String?, String?) -> Unit) {
        val record = draft.toRecordOrNull() ?: run {
            onResult(null, "请填写动作、分类和有效次数")
            return
        }
        viewModelScope.launch {
            _recordActionState.value = RecordActionState(saving = true)
            val result = recordRepository.createRecord(record)
            val created = result.getOrNull()
            if (result.isSuccess) {
                refreshReadData()
            }
            val error = result.exceptionOrNull()?.userMessage()
            _recordActionState.value = RecordActionState(errorMessage = error)
            onResult(created?.id, error)
        }
    }

    fun updateRecord(id: String, draft: RecordDraft, onResult: (Boolean, String?) -> Unit) {
        val current = recordRepository.getRecord(id) ?: run {
            onResult(false, "记录不存在")
            return
        }
        val next = draft.toRecordOrNull(existing = current) ?: run {
            onResult(false, "请填写动作、分类和有效次数")
            return
        }
        viewModelScope.launch {
            _recordActionState.value = RecordActionState(saving = true)
            val result = recordRepository.updateRecord(next)
            if (result.isSuccess) {
                refreshReadData()
            }
            val error = result.exceptionOrNull()?.userMessage()
            _recordActionState.value = RecordActionState(errorMessage = error)
            onResult(result.isSuccess, error)
        }
    }

    fun deleteRecord(id: String, onResult: (Boolean, String?) -> Unit = { _, _ -> }) {
        viewModelScope.launch {
            _recordActionState.value = RecordActionState(deleting = true)
            val result = recordRepository.deleteRecord(id)
            if (result.isSuccess) {
                refreshReadData()
            }
            val error = result.exceptionOrNull()?.userMessage()
            _recordActionState.value = RecordActionState(errorMessage = error)
            onResult(result.isSuccess, error)
        }
    }

    fun attachVideo(recordId: String, uri: Uri) {
        viewModelScope.launch {
            _recordActionState.value = RecordActionState(uploadingVideo = true)
            val result = videoRepository.attachVideo(recordId, uri)
            val error = result.exceptionOrNull()?.userMessage()
            _recordActionState.value = RecordActionState(errorMessage = error)
            error?.let { snackbar.error(it) }
        }
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
            error?.let { snackbar.error(it) }
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

    fun scorePose(recordId: String, apply: Boolean, onResult: (String?) -> Unit) {
        viewModelScope.launch {
            if (_recordActionState.value.isBusy) {
                onResult("操作正在进行中")
                return@launch
            }
            _recordActionState.value = RecordActionState(scoring = true)
            val result = analysisRepository.scorePose(recordId, apply)
            val error = result.exceptionOrNull()?.userMessage()
            if (result.isSuccess && apply) {
                refreshReadData()
            }
            _recordActionState.value = RecordActionState(errorMessage = error)
            error?.let { snackbar.error(it) }
            onResult(error)
        }
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
            exerciseId = exerciseId.ifBlank { existing?.exerciseId },
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
        _recordsOperation.value = if (refreshing && records.value.isNotEmpty()) {
            ApiOperationState.Refreshing
        } else {
            ApiOperationState.Loading
        }
        exerciseCatalogRepository.refresh()
        val result = recordRepository.refresh()
        _recordsOperation.value = operationAfter(result, records.value.isEmpty())
    }

    private suspend fun refreshStatsInternal(refreshing: Boolean) {
        _statsOperation.value = if (refreshing && stats.value.totalRecords > 0) {
            ApiOperationState.Refreshing
        } else {
            ApiOperationState.Loading
        }
        val result = statsRepository.refresh()
        _statsOperation.value = operationAfter(result, stats.value.totalRecords == 0)
    }

    private fun operationAfter(result: Result<Unit>, empty: Boolean): ApiOperationState {
        return result.fold(
            onSuccess = { if (empty) ApiOperationState.Empty else ApiOperationState.Ready },
            onFailure = { throwable ->
                if ((throwable as? ApiRequestException)?.kind == ApiErrorKind.Authentication) {
                    sessionManager.notifyUnauthorized()
                    ApiOperationState.Unauthenticated
                } else {
                    ApiOperationState.RecoverableError(throwable.userMessage())
                }
            }
        )
    }

    private fun Throwable.userMessage(): String {
        return message ?: "操作失败，请稍后重试"
    }

    class Factory(
        private val container: AppContainer
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            return FitnessAiViewModel(
                repositories = container.repositories,
                sessionManager = container.sessionManager,
                snackbar = container.snackbarController
            ) as T
        }
    }
}

data class HomeState(
    val summary: StatsSummary,
    val recentRecords: List<TrainingRecord>,
    val trendPoints: List<TrendPoint>,
    val operation: ApiOperationState = ApiOperationState.Ready
)

private fun List<TrainingRecord>.toTrendPoints(): List<TrendPoint> {
    val today = LocalDate.now()
    val byDate = groupBy { it.recordedAt.toLocalDate() }
    return (6 downTo 0).map { offset ->
        val date = today.minusDays(offset.toLong())
        val dayRecords = byDate[date].orEmpty()
        TrendPoint(
            date = date,
            sessions = dayRecords.size,
            durationSeconds = dayRecords.sumOf { it.durationSeconds ?: 0 }
        )
    }
}

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
