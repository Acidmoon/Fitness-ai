package com.fitnessai.android.ui.settings

import com.fitnessai.android.core.cache.CacheCleaner
import com.fitnessai.android.core.config.ApiClientHolder
import com.fitnessai.android.core.config.RuntimeConfig
import com.fitnessai.android.core.config.RuntimeConfigStore
import com.fitnessai.android.core.session.SessionManager
import com.fitnessai.android.core.snackbar.SnackbarController
import com.fitnessai.android.core.theme.ThemeManager
import com.fitnessai.android.core.theme.ThemeMode
import com.fitnessai.android.data.api.ApiServices
import com.fitnessai.android.data.api.AuthApiService
import com.fitnessai.android.data.api.ExerciseApiService
import com.fitnessai.android.data.api.ExerciseRecordCreateDto
import com.fitnessai.android.data.api.ExerciseRecordDto
import com.fitnessai.android.data.api.ExerciseRecordUpdateDto
import com.fitnessai.android.data.api.InMemoryTokenStore
import com.fitnessai.android.data.api.PersonalBestStatsDto
import com.fitnessai.android.data.api.PoseAnalysisApiService
import com.fitnessai.android.data.api.PoseAnalysisTriggerDto
import com.fitnessai.android.data.api.PoseScoringApiService
import com.fitnessai.android.data.api.PoseScoringRequestDto
import com.fitnessai.android.data.api.RegisterRequestDto
import com.fitnessai.android.data.api.StatsApiService
import com.fitnessai.android.data.api.UserApiService
import com.fitnessai.android.data.api.VideoApiService
import com.fitnessai.android.data.api.WeeklyStatsDto
import com.fitnessai.android.data.model.UserRole
import com.fitnessai.android.data.model.UserSession
import com.fitnessai.android.data.repository.AuthRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class SettingsViewModelTest {
    private val dispatcher = StandardTestDispatcher()

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun saveBaseUrlRejectsInvalidValueWithoutCallingHolder() = runTest(dispatcher) {
        val deps = newDeps()
        val viewModel = deps.buildViewModel()
        advanceUntilIdle()

        viewModel.onBaseUrlInputChange("invalid")
        advanceUntilIdle()
        viewModel.saveBaseUrl()
        advanceUntilIdle()

        assertNotNull(viewModel.state.value.baseUrlError)
        assertEquals("http://localhost:8000/", deps.holder.baseUrl.value)
    }

    @Test
    fun saveBaseUrlRebuildsHolderAndPersistsRuntimeConfig() = runTest(dispatcher) {
        val deps = newDeps()
        val viewModel = deps.buildViewModel()
        advanceUntilIdle()

        viewModel.onBaseUrlInputChange("https://api.example.com/")
        advanceUntilIdle()
        viewModel.saveBaseUrl()
        advanceUntilIdle()

        assertEquals("https://api.example.com/", deps.holder.baseUrl.value)
        assertEquals("https://api.example.com/", deps.runtimeConfigStore.config.value.baseUrl)
        assertNull(viewModel.state.value.baseUrlError)
    }

    @Test
    fun setThemeModePersistsThroughThemeManager() = runTest(dispatcher) {
        val deps = newDeps()
        val viewModel = deps.buildViewModel()

        viewModel.setThemeMode(ThemeMode.Dark)
        advanceUntilIdle()

        assertEquals(ThemeMode.Dark, deps.themeManager.themeMode.value)
    }

    @Test
    fun clearCacheInvokesCleanerAndResetsBusyState() = runTest(dispatcher) {
        val deps = newDeps()
        val viewModel = deps.buildViewModel()

        viewModel.clearCache()
        advanceUntilIdle()

        assertEquals(1, deps.cacheCleaner.calls)
        assertFalse(viewModel.state.value.clearingCache)
    }

    @Test
    fun logoutCallsSessionManagerOnManualLogout() = runTest(dispatcher) {
        val deps = newDeps()
        val viewModel = deps.buildViewModel()

        viewModel.logout()
        advanceUntilIdle()

        assertEquals(1, deps.authRepository.logoutCalls)
    }

    private fun newDeps(): Deps {
        val tokenStore = InMemoryTokenStore()
        val holder = ApiClientHolder(
            tokenStore = tokenStore,
            initialBaseUrl = "http://localhost:8000/",
            factory = { _, _, _ -> StubServices.create() }
        )
        val runtimeConfig = FakeRuntimeConfigStore(initial = "http://localhost:8000/")
        val themeManager = FakeThemeManager()
        val authRepository = FakeAuthRepository()
        val cacheCleaner = RecordingCacheCleaner()
        val reducedMotionStore = FakeReducedMotionStore()
        val snackbar = SnackbarController()
        val sessionManager = SessionManager(authRepository, kotlinx.coroutines.CoroutineScope(dispatcher))
        return Deps(
            holder = holder,
            runtimeConfigStore = runtimeConfig,
            themeManager = themeManager,
            cacheCleaner = cacheCleaner,
            sessionManager = sessionManager,
            authRepository = authRepository,
            snackbar = snackbar,
            reducedMotionStore = reducedMotionStore
        )
    }

    private class Deps(
        val holder: ApiClientHolder,
        val runtimeConfigStore: FakeRuntimeConfigStore,
        val themeManager: FakeThemeManager,
        val cacheCleaner: RecordingCacheCleaner,
        val sessionManager: SessionManager,
        val authRepository: FakeAuthRepository,
        val snackbar: SnackbarController,
        val reducedMotionStore: FakeReducedMotionStore
    ) {
        fun buildViewModel(): SettingsViewModel {
            return SettingsViewModel(
                themeManager = themeManager,
                runtimeConfigStore = runtimeConfigStore,
                apiClientHolder = holder,
                cacheCleaner = cacheCleaner,
                sessionManager = sessionManager,
                snackbar = snackbar,
                reducedMotionStore = reducedMotionStore
            )
        }
    }
}

private object StubServices {
    fun create(): ApiServices = ApiServices(
        auth = StubAuthApi,
        user = StubUserApi,
        exercise = StubExerciseApi,
        stats = StubStatsApi,
        video = StubVideoApi,
        poseAnalysis = StubPoseAnalysisApi,
        poseScoring = StubPoseScoringApi
    )
}

private object StubAuthApi : AuthApiService {
    override suspend fun register(request: RegisterRequestDto) = error("stub")
    override suspend fun login(username: String, password: String) = error("stub")
}

private object StubUserApi : UserApiService {
    override suspend fun getProfile() = error("stub")
}

private object StubExerciseApi : ExerciseApiService {
    override suspend fun getExercises() = emptyList<com.fitnessai.android.data.api.ExerciseDto>()
    override suspend fun getRecords(
        startDate: String?,
        endDate: String?,
        exerciseId: Int?,
        skip: Int,
        limit: Int
    ): List<ExerciseRecordDto> = emptyList()

    override suspend fun getRecord(recordId: Int): ExerciseRecordDto = error("stub")
    override suspend fun createRecord(record: ExerciseRecordCreateDto): ExerciseRecordDto = error("stub")
    override suspend fun updateRecord(recordId: Int, record: ExerciseRecordUpdateDto): ExerciseRecordDto = error("stub")
    override suspend fun deleteRecord(recordId: Int) = Unit
}

private object StubStatsApi : StatsApiService {
    override suspend fun getSummary() = error("stub")
    override suspend fun getWeeklyStats(): List<WeeklyStatsDto> = emptyList()
    override suspend fun getPersonalBest(): List<PersonalBestStatsDto> = emptyList()
}

private object StubVideoApi : VideoApiService {
    override suspend fun uploadVideo(
        recordId: Int,
        video: okhttp3.MultipartBody.Part,
        keepVideo: Boolean
    ) = error("stub")

    override suspend fun deleteVideo(recordId: Int) = Unit
    override suspend fun getVideo(filename: String): okhttp3.ResponseBody = error("stub")
}

private object StubPoseAnalysisApi : PoseAnalysisApiService {
    override suspend fun triggerPoseAnalysis(recordId: Int, request: PoseAnalysisTriggerDto?) = error("stub")
    override suspend fun createPoseAnalysisJob(recordId: Int, request: PoseAnalysisTriggerDto?) = error("stub")
    override suspend fun getPoseAnalysisJob(jobId: Int) = error("stub")
    override suspend fun getPoseAnalysis(recordId: Int) = error("stub")
}

private object StubPoseScoringApi : PoseScoringApiService {
    override suspend fun scorePose(recordId: Int, request: PoseScoringRequestDto) = error("stub")
}

private class FakeRuntimeConfigStore(initial: String) : RuntimeConfigStore {
    private val _config = MutableStateFlow(RuntimeConfig(initial))
    override val config: StateFlow<RuntimeConfig> = _config

    override suspend fun setBaseUrl(value: String) {
        require(RuntimeConfig.BASE_URL_REGEX.matches(value)) {
            "BaseUrl 必须以 http:// 或 https:// 开头并以 / 结尾"
        }
        _config.value = RuntimeConfig(value)
    }
}

private class FakeThemeManager : ThemeManager {
    private val _mode = MutableStateFlow(ThemeMode.System)
    override val themeMode: StateFlow<ThemeMode> = _mode
    override suspend fun setMode(mode: ThemeMode) {
        _mode.value = mode
    }
}

private class RecordingCacheCleaner : CacheCleaner {
    var calls = 0
        private set

    override suspend fun clear(): Result<Unit> {
        calls += 1
        return Result.success(Unit)
    }
}

private class FakeReducedMotionStore : ReducedMotionStore {
    private val _value = MutableStateFlow(false)
    override val reducedMotion: StateFlow<Boolean> = _value
    override suspend fun setReducedMotion(enabled: Boolean) {
        _value.value = enabled
    }
}

private class FakeAuthRepository : AuthRepository {
    private val _session = MutableStateFlow<UserSession?>(UserSession(userId = "1", displayName = "tester"))
    override val session: StateFlow<UserSession?> = _session
    var logoutCalls = 0
        private set

    override suspend fun login(username: String, password: String): Result<Unit> = Result.success(Unit)
    override fun selectRole(role: UserRole) = Unit
    override suspend fun logout() {
        logoutCalls += 1
        _session.value = null
    }
}
