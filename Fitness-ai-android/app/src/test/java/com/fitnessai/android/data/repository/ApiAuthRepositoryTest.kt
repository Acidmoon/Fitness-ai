package com.fitnessai.android.data.repository

import com.fitnessai.android.data.api.ApiClientFactory
import com.fitnessai.android.data.api.ApiErrorKind
import com.fitnessai.android.data.api.ApiRequestException
import com.fitnessai.android.data.api.InMemoryTokenStore
import kotlinx.coroutines.test.runTest
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ApiAuthRepositoryTest {
    @Test
    fun loginPostsOAuthFormStoresTokenAndLoadsProfile() = runTest {
        val server = MockWebServer()
        server.enqueue(
            MockResponse()
                .setHeader("Content-Type", "application/json")
                .setBody("""{"access_token":"token-123","token_type":"bearer"}""")
        )
        server.enqueue(
            MockResponse()
                .setHeader("Content-Type", "application/json")
                .setBody(
                    """
                    {
                      "id": 42,
                      "username": "backend_user",
                      "email": "backend@example.com",
                      "is_active": true,
                      "created_at": "2026-05-06T01:00:00Z",
                      "updated_at": "2026-05-06T01:00:00Z"
                    }
                    """.trimIndent()
                )
        )
        server.start()
        try {
            val tokenStore = InMemoryTokenStore()
            val repository = ApiAuthRepository(
                services = ApiClientFactory.create(server.url("/").toString(), tokenStore),
                tokenStore = tokenStore
            )

            val result = repository.login("backend_user", "password123")

            assertTrue(result.isSuccess)
            assertEquals("token-123", tokenStore.getAccessToken())
            assertEquals("42", repository.session.value?.userId)
            assertEquals("backend_user", repository.session.value?.displayName)
            val loginRequest = server.takeRequest()
            assertEquals("/api/auth/login", loginRequest.path?.substringBefore("?"))
            assertEquals("username=backend_user&password=password123", loginRequest.body.readUtf8())
            assertEquals("Bearer token-123", server.takeRequest().getHeader("Authorization"))
        } finally {
            server.shutdown()
        }
    }

    @Test
    fun bootstrapRestoresSessionFromStoredToken() = runTest {
        val server = MockWebServer()
        server.enqueue(profileResponse(id = 13, username = "restored_user"))
        server.start()
        try {
            val tokenStore = InMemoryTokenStore("stored-token")
            val repository = ApiAuthRepository(
                services = ApiClientFactory.create(server.url("/").toString(), tokenStore),
                tokenStore = tokenStore
            )

            val result = repository.bootstrap()

            assertTrue(result.isSuccess)
            assertEquals("13", repository.session.value?.userId)
            assertEquals("restored_user", repository.session.value?.displayName)
            assertEquals("Bearer stored-token", server.takeRequest().getHeader("Authorization"))
        } finally {
            server.shutdown()
        }
    }

    @Test
    fun bootstrapClearsStaleTokenOnAuthFailure() = runTest {
        val server = MockWebServer()
        server.enqueue(
            MockResponse()
                .setResponseCode(401)
                .setHeader("Content-Type", "application/json")
                .setBody("""{"detail":"认证失败"}""")
        )
        server.start()
        try {
            val tokenStore = InMemoryTokenStore("stale-token")
            val repository = ApiAuthRepository(
                services = ApiClientFactory.create(server.url("/").toString(), tokenStore),
                tokenStore = tokenStore
            )

            val result = repository.bootstrap()

            assertTrue(result.isFailure)
            assertEquals(ApiErrorKind.Authentication, (result.exceptionOrNull() as ApiRequestException).kind)
            assertNull(tokenStore.currentAccessToken())
            assertNull(repository.session.value)
        } finally {
            server.shutdown()
        }
    }

    @Test
    fun loginClearsTokenWhenProfileValidationFailsWithAuthError() = runTest {
        val server = MockWebServer()
        server.enqueue(
            MockResponse()
                .setHeader("Content-Type", "application/json")
                .setBody("""{"access_token":"issued-token","token_type":"bearer"}""")
        )
        server.enqueue(
            MockResponse()
                .setResponseCode(403)
                .setHeader("Content-Type", "application/json")
                .setBody("""{"detail":"账户已被注销"}""")
        )
        server.start()
        try {
            val tokenStore = InMemoryTokenStore()
            val repository = ApiAuthRepository(
                services = ApiClientFactory.create(server.url("/").toString(), tokenStore),
                tokenStore = tokenStore
            )

            val result = repository.login("blocked_user", "password123")

            assertTrue(result.isFailure)
            assertEquals(ApiErrorKind.Authentication, (result.exceptionOrNull() as ApiRequestException).kind)
            assertNull(tokenStore.currentAccessToken())
            assertNull(repository.session.value)
            server.takeRequest()
            assertEquals("Bearer issued-token", server.takeRequest().getHeader("Authorization"))
        } finally {
            server.shutdown()
        }
    }

    @Test
    fun logoutClearsSessionAndCachedToken() = runTest {
        val server = MockWebServer()
        server.enqueue(profileResponse(id = 21, username = "logout_user"))
        server.start()
        try {
            val tokenStore = InMemoryTokenStore("stored-token")
            val repository = ApiAuthRepository(
                services = ApiClientFactory.create(server.url("/").toString(), tokenStore),
                tokenStore = tokenStore
            )

            repository.bootstrap()
            repository.logout()

            assertNull(repository.session.value)
            assertNull(tokenStore.currentAccessToken())
            assertNull(tokenStore.getAccessToken())
        } finally {
            server.shutdown()
        }
    }

    private fun profileResponse(id: Int, username: String): MockResponse {
        return MockResponse()
            .setHeader("Content-Type", "application/json")
            .setBody(
                """
                {
                  "id": $id,
                  "username": "$username",
                  "email": "$username@example.com",
                  "is_active": true,
                  "created_at": "2026-05-06T01:00:00Z",
                  "updated_at": "2026-05-06T01:00:00Z"
                }
                """.trimIndent()
            )
    }
}
