package com.fitnessai.android.data.api

import kotlinx.coroutines.test.runTest
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.ResponseBody.Companion.toResponseBody
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import retrofit2.HttpException
import retrofit2.Response
import java.io.IOException

class ApiCoreTest {
    @Test
    fun inMemoryTokenStoreSavesAndClearsToken() = runTest {
        val tokenStore = InMemoryTokenStore()

        tokenStore.saveAccessToken("abc123")
        assertEquals("abc123", tokenStore.getAccessToken())

        tokenStore.clearAccessToken()
        assertNull(tokenStore.getAccessToken())
    }

    @Test
    fun authorizationInterceptorAddsBearerToken() {
        val server = MockWebServer()
        server.enqueue(MockResponse().setBody("{}"))
        server.start()
        try {
            val client = OkHttpClient.Builder()
                .addInterceptor(AuthorizationInterceptor(InMemoryTokenStore("token-1")))
                .build()
            val request = Request.Builder()
                .url(server.url("/api/user/profile"))
                .build()

            client.newCall(request).execute().use { response ->
                assertEquals(200, response.code)
            }

            assertEquals("Bearer token-1", server.takeRequest().getHeader("Authorization"))
        } finally {
            server.shutdown()
        }
    }

    @Test
    fun errorMapperPreservesBackendDetailAndNetworkFailures() {
        val body = """{"detail":"用户名或密码错误"}"""
            .toResponseBody("application/json".toMediaType())
        val httpException = HttpException(Response.error<String>(401, body))

        val authError = ApiErrorMapper.toException(httpException)
        val networkError = ApiErrorMapper.toException(IOException("timeout"))

        assertEquals(ApiErrorKind.Authentication, authError.kind)
        assertEquals("用户名或密码错误", authError.message)
        assertEquals(401, authError.statusCode)
        assertEquals(ApiErrorKind.Network, networkError.kind)
    }
}
