package com.fitnessai.android.data.repository

import com.fitnessai.android.data.api.ApiServices
import com.fitnessai.android.data.api.TokenStore
import com.fitnessai.android.data.api.apiResult
import com.fitnessai.android.data.api.toUserSession
import com.fitnessai.android.data.model.UserRole
import com.fitnessai.android.data.model.UserSession
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update

class ApiAuthRepository(
    private val services: ApiServices,
    private val tokenStore: TokenStore
) : AuthRepository {
    private val _session = MutableStateFlow<UserSession?>(null)
    override val session: StateFlow<UserSession?> = _session

    override suspend fun login(username: String, password: String): Result<Unit> {
        return apiResult {
            val token = services.auth.login(username.trim(), password)
            tokenStore.saveAccessToken(token.accessToken)
            _session.value = runCatching {
                services.user.getProfile().toUserSession()
            }.getOrElse {
                UserSession(userId = username.trim(), displayName = username.trim())
            }
        }
    }

    override fun selectRole(role: UserRole) {
        _session.update { current -> current?.copy(role = role) }
    }

    override suspend fun logout() {
        tokenStore.clearAccessToken()
        _session.value = null
    }
}
