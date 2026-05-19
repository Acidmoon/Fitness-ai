package com.fitnessai.android.ui.auth

import com.fitnessai.android.core.session.SessionManager
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
class RegisterViewModelTest {
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
    fun successfulRegistrationLogsInAndSignalsRegistered() = runTest(dispatcher) {
        val auth = RegisterAuthRepositoryFake()
        val sessionManager = SessionManager(auth, TestScope(dispatcher))
        val viewModel = RegisterViewModel(auth, sessionManager)

        viewModel.onFormChange(
            RegisterFormState(
                username = "newuser",
                password = "password123",
                confirmPassword = "password123",
                email = "new@example.com"
            )
        )
        viewModel.submit()
        advanceUntilIdle()

        assertTrue(viewModel.state.value.registered)
        assertNull(viewModel.state.value.errorMessage)
        assertTrue(auth.registerCalls == 1)
        assertTrue(auth.loginCalls == 1)
    }

    @Test
    fun conflictResponseMapsToNonNullErrorMessage() = runTest(dispatcher) {
        val auth = RegisterAuthRepositoryFake(
            registerResult = Result.failure(
                ApiRequestException(kind = ApiErrorKind.Unexpected, message = "conflict", statusCode = 409)
            )
        )
        val sessionManager = SessionManager(auth, TestScope(dispatcher))
        val viewModel = RegisterViewModel(auth, sessionManager)

        viewModel.onFormChange(
            RegisterFormState(
                username = "taken",
                password = "password123",
                confirmPassword = "password123",
                email = ""
            )
        )
        viewModel.submit()
        advanceUntilIdle()

        assertNotNull(viewModel.state.value.errorMessage)
        assertFalse(viewModel.state.value.registered)
    }
}

private class RegisterAuthRepositoryFake(
    private val registerResult: Result<Unit> = Result.success(Unit),
    private val loginResult: Result<Unit> = Result.success(Unit)
) : AuthRepository {
    private val _session = MutableStateFlow<UserSession?>(null)
    override val session: StateFlow<UserSession?> = _session
    var registerCalls = 0
        private set
    var loginCalls = 0
        private set

    override suspend fun register(username: String, password: String, email: String?): Result<Unit> {
        registerCalls += 1
        return registerResult
    }

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
