package com.fitnessai.android.core.theme

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch

enum class ThemeMode {
    System,
    Light,
    Dark
}

interface ThemeManager {
    val themeMode: StateFlow<ThemeMode>
    suspend fun setMode(mode: ThemeMode)
}

class DataStoreThemeManager(
    private val dataStore: DataStore<Preferences>,
    scope: CoroutineScope
) : ThemeManager {
    private val themeKey = stringPreferencesKey("theme_mode")
    private val _themeMode = MutableStateFlow(ThemeMode.System)
    override val themeMode: StateFlow<ThemeMode> = _themeMode

    init {
        scope.launch {
            dataStore.data
                .map { preferences ->
                    preferences[themeKey]?.let { stored ->
                        runCatching { ThemeMode.valueOf(stored) }.getOrDefault(ThemeMode.System)
                    } ?: ThemeMode.System
                }
                .collect { mode -> _themeMode.value = mode }
        }
    }

    override suspend fun setMode(mode: ThemeMode) {
        dataStore.edit { preferences -> preferences[themeKey] = mode.name }
        _themeMode.value = mode
    }
}
