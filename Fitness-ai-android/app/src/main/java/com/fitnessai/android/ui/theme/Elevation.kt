package com.fitnessai.android.ui.theme

import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

@Immutable
data class AppElevation(
    val card: Dp = 1.dp,
    val overlay: Dp = 6.dp
)

val LocalAppElevation = staticCompositionLocalOf { AppElevation() }
