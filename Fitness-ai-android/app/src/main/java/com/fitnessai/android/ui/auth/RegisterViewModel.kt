package com.fitnessai.android.ui.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.fitnessai.android.core.session.SessionManager
import com.fitnessai.android.data.api.ApiErrorKind
import com.fitnessai.android.data.api.ApiRequestException
import com.fitnessai.android.data.repository.AuthRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class RegisterUiState(
    val form: RegisterFormState = RegisterFormState(),
    val errors: RegisterFormErrors = RegisterFormErrors(),
    val submitting: Boolean = false,
    val errorMessage: String? = null,
    val registered: Boolean = false
) {
    val canSubmit: Boolean
        get() = !submitting && !errors.hasErrors
}

class RegisterViewModel(
    private val authRepository: AuthRepository,
    private val sessionManager: SessionManager
) : ViewModel() {
    private val _state = MutableStateFlow(RegisterUiState(errors = RegisterValidator.validate(RegisterFormState())))
    val state: StateFlow<RegisterUiState> = _state.asStateFlow()

    fun onFormChange(form: RegisterFormState) {
        _state.update {
            it.copy(form = form, errors = RegisterValidator.validate(form), errorMessage = null)
        }
    }

    fun consumeRegistered() {
        _state.update { it.copy(registered = false) }
    }

    fun submit() {
        val current = _state.value
        if (current.errors.hasErrors) return
        _state.update { it.copy(submitting = true, errorMessage = null) }
        viewModelScope.launch {
            val email = current.form.email.takeIf { it.isNotBlank() }
            val registerResult = authRepository.register(
                current.form.username.trim(),
                current.form.password,
                email
            )
            if (registerResult.isFailure) {
                val throwable = registerResult.exceptionOrNull()
                _state.update {
                    it.copy(submitting = false, errorMessage = mapRegisterError(throwable))
                }
                return@launch
            }

            val loginResult = authRepository.login(
                current.form.username.trim(),
                current.form.password
            )
            if (loginResult.isSuccess) {
                sessionManager.onLoginSuccess()
                _state.update { RegisterUiState(registered = true) }
            } else {
                _state.update {
                    it.copy(
                        submitting = false,
                        errorMessage = mapRegisterError(loginResult.exceptionOrNull())
                    )
                }
            }
        }
    }

    private fun mapRegisterError(throwable: Throwable?): String {
        val apiError = throwable as? ApiRequestException
        if (apiError?.statusCode == 409) return "用户名已被占用"
        if (apiError?.kind == ApiErrorKind.Validation && apiError.statusCode == 400 &&
            apiError.message.contains("已存在")
        ) {
            return "用户名已被占用"
        }
        return apiError?.message ?: throwable?.message ?: "注册失败，请稍后再试"
    }

    class Factory(
        private val authRepository: AuthRepository,
        private val sessionManager: SessionManager
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            return RegisterViewModel(authRepository, sessionManager) as T
        }
    }
}
