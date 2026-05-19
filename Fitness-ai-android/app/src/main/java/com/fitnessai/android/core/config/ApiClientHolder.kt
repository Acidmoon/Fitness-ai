package com.fitnessai.android.core.config

import com.fitnessai.android.data.api.ApiClientFactory
import com.fitnessai.android.data.api.ApiServices
import com.fitnessai.android.data.api.TokenStore
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/**
 * Holds the active [ApiServices] bundle and rebuilds the underlying Retrofit/OkHttp stack when
 * the backend BaseUrl changes. Repositories should hold a reference to this holder and fetch
 * services lazily via [services].value so a runtime BaseUrl swap is picked up on the next call.
 */
class ApiClientHolder(
    private val tokenStore: TokenStore,
    initialBaseUrl: String,
    private val onAuthFailure: () -> Unit = {},
    private val factory: (String, TokenStore, () -> Unit) -> ApiServices = { baseUrl, store, authFailure ->
        ApiClientFactory.create(baseUrl, store, authFailure)
    }
) {
    private val _services = MutableStateFlow(factory(initialBaseUrl, tokenStore, onAuthFailure))
    val services: StateFlow<ApiServices> = _services

    private val _baseUrl = MutableStateFlow(initialBaseUrl)
    val baseUrl: StateFlow<String> = _baseUrl

    suspend fun rebuild(baseUrl: String): Result<Unit> = runCatching {
        require(RuntimeConfig.BASE_URL_REGEX.matches(baseUrl)) {
            "BaseUrl 必须以 http:// 或 https:// 开头并以 / 结尾"
        }
        val next = factory(baseUrl, tokenStore, onAuthFailure)
        _services.value = next
        _baseUrl.value = baseUrl
    }
}
