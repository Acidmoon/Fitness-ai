package com.fitnessai.android.ui.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.fitnessai.android.core.cache.CacheCleaner
import com.fitnessai.android.core.config.ApiClientHolder
import com.fitnessai.android.core.config.RuntimeConfig
import com.fitnessai.android.core.config.RuntimeConfigStore
import com.fitnessai.android.core.session.SessionManager
import com.fitnessai.android.core.snackbar.SnackbarController
import com.fitnessai.android.core.theme.ThemeManager
import com.fitnessai.android.core.theme.ThemeMode
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class SettingsUiState(
    val themeMode: ThemeMode = ThemeMode.System,
    val baseUrlInput: String = "",
    val savedBaseUrl: String = "",
    val baseUrlError: String? = null,
    val saving: Boolean = false,
    val clearingCache: Boolean = false,
    val reducedMotion: Boolean = false
) {
    val canSaveBaseUrl: Boolean
        get() = !saving && baseUrlInput.isNotBlank() && baseUrlInput != savedBaseUrl
}

class SettingsViewModel(
    private val themeManager: ThemeManager,
    private val runtimeConfigStore: RuntimeConfigStore,
    private val apiClientHolder: ApiClientHolder,
    private val cacheCleaner: CacheCleaner,
    private val sessionManager: SessionManager,
    private val snackbar: SnackbarController,
    private val reducedMotionStore: ReducedMotionStore
) : ViewModel() {
    private val _draft = MutableStateFlow(DraftValues())

    val state: StateFlow<SettingsUiState> = combine(
        themeManager.themeMode,
        runtimeConfigStore.config,
        reducedMotionStore.reducedMotion,
        _draft
    ) { theme, config, reducedMotion, draft ->
        SettingsUiState(
            themeMode = theme,
            baseUrlInput = draft.baseUrlInput ?: config.baseUrl,
            savedBaseUrl = config.baseUrl,
            baseUrlError = draft.baseUrlError,
            saving = draft.saving,
            clearingCache = draft.clearingCache,
            reducedMotion = reducedMotion
        )
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.Eagerly,
        initialValue = SettingsUiState()
    )

    fun onBaseUrlInputChange(value: String) {
        _draft.update { it.copy(baseUrlInput = value, baseUrlError = null) }
    }

    fun setThemeMode(mode: ThemeMode) {
        viewModelScope.launch {
            themeManager.setMode(mode)
            snackbar.info(
                when (mode) {
                    ThemeMode.System -> "已跟随系统主题"
                    ThemeMode.Light -> "已切换到浅色主题"
                    ThemeMode.Dark -> "已切换到深色主题"
                }
            )
        }
    }

    fun setReducedMotion(enabled: Boolean) {
        viewModelScope.launch {
            reducedMotionStore.setReducedMotion(enabled)
        }
    }

    fun saveBaseUrl() {
        val current = state.value
        val target = current.baseUrlInput.trim()
        if (!RuntimeConfig.BASE_URL_REGEX.matches(target)) {
            _draft.update { it.copy(baseUrlError = "BaseUrl 必须以 http:// 或 https:// 开头并以 / 结尾") }
            return
        }
        if (target == current.savedBaseUrl) return

        _draft.update { it.copy(saving = true, baseUrlError = null) }
        viewModelScope.launch {
            val rebuild = apiClientHolder.rebuild(target)
            if (rebuild.isFailure) {
                val message = rebuild.exceptionOrNull()?.message ?: "API 配置更新失败"
                _draft.update { it.copy(saving = false, baseUrlError = message) }
                snackbar.error(message)
                return@launch
            }
            runCatching { runtimeConfigStore.setBaseUrl(target) }
                .onFailure { throwable ->
                    val message = throwable.message ?: "API 配置保存失败"
                    _draft.update { it.copy(saving = false, baseUrlError = message) }
                    snackbar.error(message)
                    return@launch
                }
            _draft.update { it.copy(saving = false, baseUrlInput = null, baseUrlError = null) }
            snackbar.info("API 配置已保存")
        }
    }

    fun clearCache() {
        if (_draft.value.clearingCache) return
        _draft.update { it.copy(clearingCache = true) }
        viewModelScope.launch {
            cacheCleaner.clear()
            _draft.update { it.copy(clearingCache = false) }
            snackbar.info("缓存已清除")
        }
    }

    fun logout() {
        sessionManager.onManualLogout()
    }

    private data class DraftValues(
        val baseUrlInput: String? = null,
        val baseUrlError: String? = null,
        val saving: Boolean = false,
        val clearingCache: Boolean = false
    )

    class Factory(
        private val themeManager: ThemeManager,
        private val runtimeConfigStore: RuntimeConfigStore,
        private val apiClientHolder: ApiClientHolder,
        private val cacheCleaner: CacheCleaner,
        private val sessionManager: SessionManager,
        private val snackbar: SnackbarController,
        private val reducedMotionStore: ReducedMotionStore
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            return SettingsViewModel(
                themeManager,
                runtimeConfigStore,
                apiClientHolder,
                cacheCleaner,
                sessionManager,
                snackbar,
                reducedMotionStore
            ) as T
        }
    }
}
