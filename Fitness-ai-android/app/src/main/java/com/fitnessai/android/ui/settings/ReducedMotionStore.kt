package com.fitnessai.android.ui.settings

import android.provider.Settings
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch

/**
 * Whether the user has opted in to reduced motion. We seed it from
 * [Settings.Global.ANIMATOR_DURATION_SCALE] so users who already disable system animations
 * see a consistent experience the first time they open Settings.
 */
interface ReducedMotionStore {
    val reducedMotion: StateFlow<Boolean>
    suspend fun setReducedMotion(enabled: Boolean)
}

class DataStoreReducedMotionStore(
    private val dataStore: DataStore<Preferences>,
    scope: CoroutineScope,
    initialValue: Boolean = false
) : ReducedMotionStore {
    private val key = booleanPreferencesKey("reduced_motion")
    private val _reducedMotion = MutableStateFlow(initialValue)
    override val reducedMotion: StateFlow<Boolean> = _reducedMotion

    init {
        scope.launch {
            dataStore.data
                .map { preferences -> preferences[key] ?: initialValue }
                .collect { value -> _reducedMotion.value = value }
        }
    }

    override suspend fun setReducedMotion(enabled: Boolean) {
        dataStore.edit { preferences -> preferences[key] = enabled }
        _reducedMotion.value = enabled
    }

    companion object {
        fun systemDefault(animatorDurationScale: Float?): Boolean {
            return animatorDurationScale?.let { it == 0f } ?: false
        }
    }
}

val LocalReducedMotion = staticCompositionLocalOf { false }
