package com.fitnessai.android.ui.auth

import com.fitnessai.android.core.session.SessionManager
import com.fitnessai.android.core.snackbar.SnackbarController
import com.fitnessai.android.data.api.ApiErrorKind
import com.fitnessai.android.data.api.ApiRequestException
import com.fitnessai.android.data.model.UserSession
import com.fitnessai.android.data.repository.AuthRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class LoginViewModelTest {
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
    fun blankFieldsTriggerInlineErrorsAndSkipNetwork() = runTest(dispatcher) {
        val authRepository = LoginAuthRepositoryFake()
        val sessionManager = SessionManager(authRepository, TestScope(dispatcher))
        val viewModel = LoginViewModel(authRepository, sessionManager, SnackbarController())

        viewModel.submit()

        val state = viewModel.state.value
        assertNotNull(state.usernameError)
        assertNotNull(state.passwordError)
        assertFalse(state.submitting)
        assertTrue(authRepository.loginCalls == 0)
    }

    @Test
    fun successfulLoginResetsSessionGateAndSignalsLoggedIn() = runTest(dispatcher) {
        val authRepository = LoginAuthRepositoryFake()
        val sessionManager = SessionManager(authRepository, TestScope(dispatcher))
        val viewModel = LoginViewModel(authRepository, sessionManager, SnackbarController())

        viewModel.onUsernameChange("alice")
        viewModel.onPasswordChange("password123")
        viewModel.submit()
        advanceUntilIdle()

        assertTrue(viewModel.state.value.loggedIn)
        assertNull(viewModel.state.value.errorMessage)
    }

    @Test
    fun unauthorizedFailureMapsToNonNullErrorMessage() = runTest(dispatcher) {
        val authRepository = LoginAuthRepositoryFake(loginResult = Result.failure(
            ApiRequestException(kind = ApiErrorKind.Authentication, message = "auth failed", statusCode = 401)
        ))
        val sessionManager = SessionManager(authRepository, TestScope(dispatcher))
        val viewModel = LoginViewModel(authRepository, sessionManager, SnackbarController())

        viewModel.onUsernameChange("alice")
        viewModel.onPasswordChange("wrong-pass")
        viewModel.submit()
        advanceUntilIdle()

        assertNotNull(viewModel.state.value.errorMessage)
        assertFalse(viewModel.state.value.submitting)
    }

    @Test
    fun rateLimitFailureMapsToNonNullErrorMessage() = runTest(dispatcher) {
        val authRepository = LoginAuthRepositoryFake(loginResult = Result.failure(
            ApiRequestException(kind = ApiErrorKind.Validation, message = "rate limit", statusCode = 429)
        ))
        val sessionManager = SessionManager(authRepository, TestScope(dispatcher))
        val viewModel = LoginViewModel(authRepository, sessionManager, SnackbarController())

        viewModel.onUsernameChange("alice")
        viewModel.onPasswordChange("password123")
        viewModel.submit()
        advanceUntilIdle()

        assertNotNull(viewModel.state.value.errorMessage)
        assertFalse(viewModel.state.value.submitting)
    }

    @Test
    fun networkFailureMapsToNonNullErrorMessage() = runTest(dispatcher) {
        val authRepository = LoginAuthRepositoryFake(loginResult = Result.failure(
            ApiRequestException(kind = ApiErrorKind.Network, message = "timeout")
        ))
        val sessionManager = SessionManager(authRepository, TestScope(dispatcher))
        val viewModel = LoginViewModel(authRepository, sessionManager, SnackbarController())

        viewModel.onUsernameChange("alice")
        viewModel.onPasswordChange("password123")
        viewModel.submit()
        advanceUntilIdle()

        assertNotNull(viewModel.state.value.errorMessage)
        assertFalse(viewModel.state.value.submitting)
    }
}

private class LoginAuthRepositoryFake(
    private val loginResult: Result<Unit> = Result.success(Unit)
) : AuthRepository {
    private val _session = MutableStateFlow<UserSession?>(null)
    override val session: StateFlow<UserSession?> = _session
    var loginCalls = 0
        private set

    override suspend fun login(username: String, password: String): Result<Unit> {
        loginCalls += 1
        if (loginResult.isSuccess) {
            _session.value = UserSession(userId = "1", displayName = username)
        }
        return loginResult
    }

    override fun selectRole(role: com.fitnessai.android.data.model.UserRole) = Unit

    override suspend fun logout() {
        _session.value = null
    }
}
