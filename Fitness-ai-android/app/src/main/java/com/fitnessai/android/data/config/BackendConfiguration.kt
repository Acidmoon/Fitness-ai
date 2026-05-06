package com.fitnessai.android.data.config

import com.fitnessai.android.BuildConfig

enum class BackendMode {
    Mock,
    Api;

    companion object {
        fun from(value: String): BackendMode {
            return when (value.trim().lowercase()) {
                "api" -> Api
                else -> Mock
            }
        }
    }
}

data class BackendConfiguration(
    val mode: BackendMode = BackendMode.Mock,
    val baseUrl: String = DEFAULT_BASE_URL
) {
    companion object {
        const val DEFAULT_BASE_URL = "http://10.0.2.2:8000/"
    }
}

object AppBackendConfiguration {
    fun fromBuildConfig(): BackendConfiguration {
        return BackendConfiguration(
            mode = BackendMode.from(BuildConfig.BACKEND_MODE),
            baseUrl = BuildConfig.BACKEND_BASE_URL
        )
    }
}
