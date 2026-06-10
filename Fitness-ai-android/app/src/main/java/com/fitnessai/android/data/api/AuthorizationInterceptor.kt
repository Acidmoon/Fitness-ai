package com.fitnessai.android.data.api

import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import org.json.JSONObject

class AuthorizationInterceptor(
    private val tokenStore: TokenStore,
    private val baseUrlProvider: () -> String,
    private val onAuthFailure: () -> Unit = {}
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val token = tokenStore.currentAccessToken()
        val request = if (token.isNullOrBlank()) {
            chain.request()
        } else {
            chain.request()
                .newBuilder()
                .header("Authorization", "Bearer $token")
                .build()
        }
        val response = chain.proceed(request)

        // Not a 401 or already refreshing — return as-is
        if (response.code != 401 || request.url.encodedPath.endsWith("/auth/refresh")) {
            return response
        }

        // Attempt refresh
        val refreshToken = runBlockingOnInterceptor {
            tokenStore.getRefreshToken()
        }
        if (refreshToken.isNullOrBlank()) {
            response.close()
            onAuthFailure()
            return response
        }

        try {
            val refreshBody = JSONObject().apply { put("refresh_token", refreshToken) }.toString()
            val refreshRequest = Request.Builder()
                .url("${baseUrlProvider()}api/auth/refresh")
                .post(refreshBody.toRequestBody("application/json".toMediaType()))
                .build()

            val refreshResponse = chain.proceed(refreshRequest)
            if (refreshResponse.isSuccessful) {
                val body = refreshResponse.body?.string()
                refreshResponse.close()
                val json = JSONObject(body ?: "{}")
                val newAccess: String? = if (json.has("access_token")) json.getString("access_token") else null
                val newRefresh: String? = if (json.has("refresh_token")) json.getString("refresh_token") else null
                if (newAccess != null) {
                    runBlockingOnInterceptor {
                        if (newRefresh != null) {
                            tokenStore.saveTokens(newAccess, newRefresh)
                        } else {
                            tokenStore.saveAccessToken(newAccess)
                        }
                    }
                    // Retry original request with new token
                    response.close()
                    val retryRequest = request.newBuilder()
                        .header("Authorization", "Bearer $newAccess")
                        .build()
                    return chain.proceed(retryRequest)
                }
            }
            refreshResponse.close()
        } catch (_: Exception) { }

        response.close()
        onAuthFailure()
        return response
    }

    /** Minimal blocking bridge for a single suspend call (only used from OkHttp interceptor). */
    private fun <T> runBlockingOnInterceptor(block: suspend () -> T): T {
        return kotlinx.coroutines.runBlocking { block() }
    }
}
