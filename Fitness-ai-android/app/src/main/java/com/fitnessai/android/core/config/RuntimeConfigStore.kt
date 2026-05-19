package com.fitnessai.android.core.config

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import com.fitnessai.android.data.config.BackendConfiguration
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch

data class RuntimeConfig(
    val baseUrl: String = BackendConfiguration.DEFAULT_BASE_URL
) {
    companion object {
        val BASE_URL_REGEX = Regex("""^https?://[^\s]+/$""")
    }
}

interface RuntimeConfigStore {
    val config: StateFlow<RuntimeConfig>
    suspend fun setBaseUrl(value: String)
}

class DataStoreRuntimeConfigStore(
    private val dataStore: DataStore<Preferences>,
    scope: CoroutineScope,
    defaultBaseUrl: String = BackendConfiguration.DEFAULT_BASE_URL
) : RuntimeConfigStore {
    private val baseUrlKey = stringPreferencesKey("base_url")
    private val _config = MutableStateFlow(RuntimeConfig(defaultBaseUrl))
    override val config: StateFlow<RuntimeConfig> = _config

    init {
        scope.launch {
            dataStore.data
                .map { preferences -> RuntimeConfig(preferences[baseUrlKey] ?: defaultBaseUrl) }
                .collect { next -> _config.value = next }
        }
    }

    override suspend fun setBaseUrl(value: String) {
        require(RuntimeConfig.BASE_URL_REGEX.matches(value)) {
            "BaseUrl 必须以 http:// 或 https:// 开头并以 / 结尾"
        }
        dataStore.edit { preferences -> preferences[baseUrlKey] = value }
        _config.value = RuntimeConfig(value)
    }
}
