package com.fitnessai.android.data.config

import com.fitnessai.android.BuildConfig

data class BackendConfiguration(
    val baseUrl: String = DEFAULT_BASE_URL
) {
    companion object {
        const val DEFAULT_BASE_URL = "http://10.0.2.2:8000/"
    }
}

object AppBackendConfiguration {
    fun fromBuildConfig(): BackendConfiguration {
        return BackendConfiguration(
            baseUrl = BuildConfig.BACKEND_BASE_URL
        )
    }
}
