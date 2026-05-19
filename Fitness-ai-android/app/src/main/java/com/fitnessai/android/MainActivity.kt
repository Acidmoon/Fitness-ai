package com.fitnessai.android

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.fitnessai.android.app.FitnessAiApp
import com.fitnessai.android.app.FitnessAiApplication
import com.fitnessai.android.app.FitnessAiViewModel
import com.fitnessai.android.core.network.LocalNetworkMonitor
import com.fitnessai.android.core.session.LocalSessionManager
import com.fitnessai.android.core.snackbar.LocalSnackbarController
import com.fitnessai.android.ui.settings.LocalReducedMotion
import com.fitnessai.android.ui.theme.FitnessAiTheme

class MainActivity : ComponentActivity() {
    private val viewModel: FitnessAiViewModel by viewModels {
        FitnessAiViewModel.Factory((application as FitnessAiApplication).container)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val container = (application as FitnessAiApplication).container
        setContent {
            val themeMode by container.themeManager.themeMode.collectAsStateWithLifecycle()
            val reducedMotion by container.reducedMotionStore.reducedMotion.collectAsStateWithLifecycle()
            CompositionLocalProvider(
                LocalSnackbarController provides container.snackbarController,
                LocalNetworkMonitor provides container.networkMonitor,
                LocalSessionManager provides container.sessionManager,
                LocalReducedMotion provides reducedMotion
            ) {
                FitnessAiTheme(themeMode = themeMode) {
                    FitnessAiApp(viewModel = viewModel)
                }
            }
        }
    }
}
