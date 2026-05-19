package com.fitnessai.android.app

import android.app.Application
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.preferencesDataStoreFile
import com.fitnessai.android.core.cache.CacheCleaner
import com.fitnessai.android.core.cache.FileCacheCleaner
import com.fitnessai.android.core.config.ApiClientHolder
import com.fitnessai.android.core.config.DataStoreRuntimeConfigStore
import com.fitnessai.android.core.config.RuntimeConfigStore
import com.fitnessai.android.core.network.ConnectivityNetworkMonitor
import com.fitnessai.android.core.network.NetworkMonitor
import com.fitnessai.android.core.session.SessionManager
import com.fitnessai.android.core.snackbar.SnackbarController
import com.fitnessai.android.core.theme.DataStoreThemeManager
import com.fitnessai.android.core.theme.ThemeManager
import com.fitnessai.android.data.api.PreferencesTokenStore
import com.fitnessai.android.data.api.TokenStore
import com.fitnessai.android.data.config.AppBackendConfiguration
import com.fitnessai.android.data.repository.AppRepositories
import com.fitnessai.android.data.repository.AppRepositoryContainer
import com.fitnessai.android.ui.settings.DataStoreReducedMotionStore
import com.fitnessai.android.ui.settings.ReducedMotionStore
import android.provider.Settings
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

/**
 * Application-wide singleton wiring. Everything that needs to survive configuration changes
 * (theme, runtime config, API client, session, snackbar, repositories) lives here. Created
 * once in [FitnessAiApplication.onCreate] and exposed to Composables via CompositionLocal.
 */
class AppContainer private constructor(
    val themeManager: ThemeManager,
    val runtimeConfigStore: RuntimeConfigStore,
    val networkMonitor: NetworkMonitor,
    val snackbarController: SnackbarController,
    val tokenStore: TokenStore,
    val apiClientHolder: ApiClientHolder,
    val sessionManager: SessionManager,
    val cacheCleaner: CacheCleaner,
    val repositories: AppRepositories,
    val reducedMotionStore: ReducedMotionStore,
    val applicationScope: CoroutineScope
) {
    companion object {
        fun create(application: Application): AppContainer {
            val applicationScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
            val dataStore = PreferenceDataStoreFactory.create(
                scope = applicationScope,
                produceFile = { application.preferencesDataStoreFile("fitness_ai_runtime") }
            )

            val initialBaseUrl = AppBackendConfiguration.fromBuildConfig().baseUrl
            val themeManager = DataStoreThemeManager(dataStore, applicationScope)
            val runtimeConfigStore = DataStoreRuntimeConfigStore(
                dataStore = dataStore,
                scope = applicationScope,
                defaultBaseUrl = initialBaseUrl
            )
            val networkMonitor = ConnectivityNetworkMonitor(application)
            val snackbarController = SnackbarController()
            val tokenStore = PreferencesTokenStore(application)

            // The auth-failure callback fires from the OkHttp interceptor when the backend
            // returns 401. We forward to SessionManager which handles the gate + emits a
            // single navigation event regardless of how many in-flight 401s arrive.
            lateinit var sessionManager: SessionManager
            val apiClientHolder = ApiClientHolder(
                tokenStore = tokenStore,
                initialBaseUrl = initialBaseUrl,
                onAuthFailure = { sessionManager.notifyUnauthorized() }
            )

            val repositories = AppRepositoryContainer.create(
                application = application,
                apiClientHolder = apiClientHolder,
                tokenStore = tokenStore
            )
            sessionManager = SessionManager(
                authRepository = repositories.authRepository,
                scope = applicationScope
            )

            // Sync ApiClientHolder with the persisted BaseUrl whenever it changes (fresh
            // install uses the build default; subsequent launches honor the stored value).
            applicationScope.launch {
                val stored = runtimeConfigStore.config.first().baseUrl
                if (stored != initialBaseUrl) {
                    apiClientHolder.rebuild(stored)
                }
            }

            return AppContainer(
                themeManager = themeManager,
                runtimeConfigStore = runtimeConfigStore,
                networkMonitor = networkMonitor,
                snackbarController = snackbarController,
                tokenStore = tokenStore,
                apiClientHolder = apiClientHolder,
                sessionManager = sessionManager,
                cacheCleaner = FileCacheCleaner(application),
                repositories = repositories,
                reducedMotionStore = DataStoreReducedMotionStore(
                    dataStore = dataStore,
                    scope = applicationScope,
                    initialValue = DataStoreReducedMotionStore.systemDefault(
                        runCatching {
                            Settings.Global.getFloat(
                                application.contentResolver,
                                Settings.Global.ANIMATOR_DURATION_SCALE
                            )
                        }.getOrNull()
                    )
                ),
                applicationScope = applicationScope
            )
        }
    }
}
