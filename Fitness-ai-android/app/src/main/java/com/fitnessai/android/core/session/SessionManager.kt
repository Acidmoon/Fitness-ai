package com.fitnessai.android.core.session

import androidx.compose.runtime.staticCompositionLocalOf
import com.fitnessai.android.data.repository.AuthRepository
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.launch

sealed interface SessionEvent {
    data class NavigateToLogin(val reason: Reason) : SessionEvent

    enum class Reason {
        Unauthorized,
        ManualLogout,
        Bootstrap
    }
}

/**
 * Centralizes auth-failure routing. The interceptor and any UI surface that detects a 401
 * call [notifyUnauthorized]; the gate guarantees we only emit once per session and only
 * call [AuthRepository.logout] once. [onLoginSuccess] resets the gate after a successful
 * sign-in so a subsequent 401 will fire again.
 */
class SessionManager(
    private val authRepository: AuthRepository,
    private val scope: CoroutineScope
) {
    private val unauthorizedGate = AtomicBoolean(false)
    private val _events = MutableSharedFlow<SessionEvent>(extraBufferCapacity = 4)
    val events: SharedFlow<SessionEvent> = _events

    fun notifyUnauthorized() {
        if (!unauthorizedGate.compareAndSet(false, true)) return
        scope.launch {
            runCatching { authRepository.logout() }
            _events.emit(SessionEvent.NavigateToLogin(SessionEvent.Reason.Unauthorized))
        }
    }

    fun onLoginSuccess() {
        unauthorizedGate.set(false)
    }

    fun onManualLogout() {
        unauthorizedGate.set(false)
        scope.launch {
            runCatching { authRepository.logout() }
            _events.emit(SessionEvent.NavigateToLogin(SessionEvent.Reason.ManualLogout))
        }
    }
}

val LocalSessionManager = staticCompositionLocalOf<SessionManager?> { null }
