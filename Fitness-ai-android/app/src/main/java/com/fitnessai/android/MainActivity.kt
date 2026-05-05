package com.fitnessai.android

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import com.fitnessai.android.app.FitnessAiApp
import com.fitnessai.android.app.FitnessAiViewModel
import com.fitnessai.android.ui.theme.FitnessAiTheme

class MainActivity : ComponentActivity() {
    private val viewModel: FitnessAiViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            FitnessAiTheme {
                FitnessAiApp(viewModel = viewModel)
            }
        }
    }
}
