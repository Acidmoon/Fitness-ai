package com.fitnessai.android.data.repository

import com.fitnessai.android.data.api.ApiClientFactory
import com.fitnessai.android.data.api.InMemoryTokenStore
import kotlinx.coroutines.test.runTest
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Assert.assertEquals
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
}
