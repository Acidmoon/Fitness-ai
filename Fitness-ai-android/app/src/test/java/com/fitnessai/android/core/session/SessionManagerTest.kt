package com.fitnessai.android.core.session

import com.fitnessai.android.data.model.UserRole
import com.fitnessai.android.data.model.UserSession
import com.fitnessai.android.data.repository.AuthRepository
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class SessionManagerTest {
    @Test
    fun unauthorizedGateOnlyEmitsOncePerLoginCycle() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val scope = TestScope(dispatcher)
        val authRepository = RecordingAuthRepository()
        val manager = SessionManager(authRepository, scope)

        val emitted = mutableListOf<SessionEvent>()
        val collector = scope.launch {
            manager.events.collect { emitted += it }
        }

        manager.notifyUnauthorized()
        manager.notifyUnauthorized()
        manager.notifyUnauthorized()
        scope.advanceUntilIdle()

        assertEquals(1, emitted.size)
        assertEquals(1, authRepository.logoutCalls)

        manager.onLoginSuccess()
        manager.notifyUnauthorized()
        scope.advanceUntilIdle()

        assertEquals(2, emitted.size)
        assertEquals(2, authRepository.logoutCalls)
        collector.cancel()
    }

    @Test
    fun manualLogoutEmitsManualLogoutReason() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val scope = TestScope(dispatcher)
        val authRepository = RecordingAuthRepository()
        val manager = SessionManager(authRepository, scope)

        val emitted = mutableListOf<SessionEvent>()
        val collector = scope.launch {
            manager.events.collect { emitted += it }
        }

        manager.onManualLogout()
        scope.advanceUntilIdle()

        assertTrue(emitted.first() is SessionEvent.NavigateToLogin)
        assertEquals(SessionEvent.Reason.ManualLogout, (emitted.first() as SessionEvent.NavigateToLogin).reason)
        collector.cancel()
    }
}

private class RecordingAuthRepository : AuthRepository {
    private val _session = MutableStateFlow<UserSession?>(UserSession())
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
