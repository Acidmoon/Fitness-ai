package com.fitnessai.android.data.config

import com.fitnessai.android.BuildConfig

data class BackendConfiguration(
    val baseUrl: String = DEFAULT_BASE_URL
) {
    companion object {
        const val DEFAULT_BASE_URL = "https://api-fitness.waterhill.cyou/"
    }
}

object AppBackendConfiguration {
    fun fromBuildConfig(): BackendConfiguration {
        return BackendConfiguration(
            baseUrl = BuildConfig.BACKEND_BASE_URL
        )
    }
}
