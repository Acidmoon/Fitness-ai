package com.fitnessai.android.ui.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.fitnessai.android.core.session.SessionManager
import com.fitnessai.android.core.snackbar.SnackbarController
import com.fitnessai.android.data.api.ApiErrorKind
import com.fitnessai.android.data.api.ApiRequestException
import com.fitnessai.android.data.repository.AuthRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class LoginUiState(
    val username: String = "",
    val password: String = "",
    val usernameError: String? = null,
    val passwordError: String? = null,
    val errorMessage: String? = null,
    val submitting: Boolean = false,
    val loggedIn: Boolean = false
) {
    val canSubmit: Boolean
        get() = !submitting && username.isNotBlank() && password.isNotBlank()
}

class LoginViewModel(
    private val authRepository: AuthRepository,
    private val sessionManager: SessionManager,
    private val snackbar: SnackbarController
) : ViewModel() {
    private val _state = MutableStateFlow(LoginUiState())
    val state: StateFlow<LoginUiState> = _state.asStateFlow()

    fun onUsernameChange(value: String) {
        _state.update { it.copy(username = value, usernameError = null, errorMessage = null) }
    }

    fun onPasswordChange(value: String) {
        _state.update { it.copy(password = value, passwordError = null, errorMessage = null) }
    }

    fun consumeLoggedIn() {
        _state.update { it.copy(loggedIn = false) }
    }

    fun submit() {
        val current = _state.value
        val usernameError = if (current.username.isBlank()) "请输入用户名" else null
        val passwordError = if (current.password.isBlank()) "请输入密码" else null
        if (usernameError != null || passwordError != null) {
            _state.update { it.copy(usernameError = usernameError, passwordError = passwordError) }
            return
        }

        _state.update { it.copy(submitting = true, errorMessage = null) }
        viewModelScope.launch {
            val result = authRepository.login(current.username, current.password)
            result.fold(
                onSuccess = {
                    sessionManager.onLoginSuccess()
                    _state.update {
                        LoginUiState(loggedIn = true)
                    }
                },
                onFailure = { throwable ->
                    val message = mapErrorMessage(throwable)
                    _state.update { it.copy(submitting = false, errorMessage = message) }
                }
            )
        }
    }

    /**
     * Display a message coming from outside the form (for example an unauthorized event from
     * SessionManager redirecting the user back to login).
     */
    fun showExternalMessage(message: String) {
        snackbar.warning(message)
    }

    private fun mapErrorMessage(throwable: Throwable): String {
        val apiError = throwable as? ApiRequestException
        return when (apiError?.kind) {
            ApiErrorKind.Authentication -> "用户名或密码错误"
            ApiErrorKind.Validation -> if (apiError.statusCode == 429) {
                "登录尝试过于频繁，请稍后再试"
            } else apiError.message
            ApiErrorKind.Network -> "网络异常，请检查连接后重试"
            ApiErrorKind.Server -> "服务暂时不可用，请稍后再试"
            else -> apiError?.message ?: throwable.message ?: "登录失败，请稍后再试"
        }
    }

    class Factory(
        private val authRepository: AuthRepository,
        private val sessionManager: SessionManager,
        private val snackbar: SnackbarController
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            return LoginViewModel(authRepository, sessionManager, snackbar) as T
        }
    }
}
