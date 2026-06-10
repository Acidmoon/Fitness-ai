package com.fitnessai.android.data.api

import com.jakewharton.retrofit2.converter.kotlinx.serialization.asConverterFactory
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import java.util.concurrent.TimeUnit

object ApiClientFactory {
    private val json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
    }

    fun create(
        baseUrl: String,
        tokenStore: TokenStore,
        onAuthFailure: () -> Unit = {}
    ): ApiServices {
        val okHttpClient = OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(15, TimeUnit.SECONDS)
            .writeTimeout(15, TimeUnit.SECONDS)
            .addInterceptor(
                AuthorizationInterceptor(
                    tokenStore = tokenStore,
                    baseUrlProvider = { normalizeBaseUrl(baseUrl) },
                    onAuthFailure = onAuthFailure,
                )
            )
            .build()
        val retrofit = Retrofit.Builder()
            .baseUrl(normalizeBaseUrl(baseUrl))
            .client(okHttpClient)
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()
        return ApiServices(
            auth = retrofit.create(AuthApiService::class.java),
            user = retrofit.create(UserApiService::class.java),
            exercise = retrofit.create(ExerciseApiService::class.java),
            stats = retrofit.create(StatsApiService::class.java),
            video = retrofit.create(VideoApiService::class.java),
            poseAnalysis = retrofit.create(PoseAnalysisApiService::class.java),
            poseScoring = retrofit.create(PoseScoringApiService::class.java)
        )
    }

    private fun normalizeBaseUrl(baseUrl: String): String {
        return if (baseUrl.endsWith("/")) baseUrl else "$baseUrl/"
    }
}
