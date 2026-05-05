package com.fitnessai.android.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val Ink = Color(0xFF17211D)
private val Muted = Color(0xFF64706B)
private val Canvas = Color(0xFFFAFAF8)
private val Surface = Color(0xFFFFFFFF)
private val Line = Color(0xFFE1E6E2)
private val Accent = Color(0xFF1F7A5C)

private val LightColors: ColorScheme = lightColorScheme(
    primary = Accent,
    onPrimary = Color.White,
    secondary = Color(0xFF3C6E71),
    onSecondary = Color.White,
    background = Canvas,
    onBackground = Ink,
    surface = Surface,
    onSurface = Ink,
    surfaceVariant = Color(0xFFF1F4F2),
    onSurfaceVariant = Muted,
    outline = Line,
    error = Color(0xFFB3261E)
)

@Composable
fun FitnessAiTheme(content: @Composable () -> Unit) {
    val colors = if (isSystemInDarkTheme()) LightColors else LightColors
    MaterialTheme(
        colorScheme = colors,
        typography = AppTypography,
        content = content
    )
}
