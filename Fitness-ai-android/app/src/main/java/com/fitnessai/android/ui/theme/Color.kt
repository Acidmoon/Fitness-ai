package com.fitnessai.android.ui.theme

import androidx.compose.material3.ColorScheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

internal val BrandPrimary = Color(0xFF1F7A5C)
internal val BrandPrimaryVariant = Color(0xFF18684E)
internal val BrandSecondary = Color(0xFF3C6E71)
internal val BrandTertiary = Color(0xFF7A6F4D)
internal val Success = Color(0xFF2E8B57)
internal val Warning = Color(0xFFE0A800)

internal val LightColors: ColorScheme = lightColorScheme(
    primary = BrandPrimary,
    onPrimary = Color.White,
    secondary = BrandSecondary,
    onSecondary = Color.White,
    tertiary = BrandTertiary,
    onTertiary = Color.White,
    background = Color(0xFFFAFAF8),
    onBackground = Color(0xFF17211D),
    surface = Color.White,
    onSurface = Color(0xFF17211D),
    surfaceVariant = Color(0xFFF1F4F2),
    onSurfaceVariant = Color(0xFF64706B),
    outline = Color(0xFFE1E6E2),
    error = Color(0xFFB3261E),
    onError = Color.White
)

internal val DarkColors: ColorScheme = darkColorScheme(
    primary = Color(0xFF4FB892),
    onPrimary = Color(0xFF003824),
    secondary = Color(0xFF8BC9CC),
    onSecondary = Color(0xFF003235),
    tertiary = Color(0xFFD7C68F),
    onTertiary = Color(0xFF3A3010),
    background = Color(0xFF101714),
    onBackground = Color(0xFFE2E8E4),
    surface = Color(0xFF18211D),
    onSurface = Color(0xFFE2E8E4),
    surfaceVariant = Color(0xFF222D29),
    onSurfaceVariant = Color(0xFFAAB5AF),
    outline = Color(0xFF3A4540),
    error = Color(0xFFF2B8B5),
    onError = Color(0xFF601410)
)

@Immutable
data class AppSemanticColors(
    val success: Color = Success,
    val warning: Color = Warning
)

val LocalAppSemanticColors = staticCompositionLocalOf { AppSemanticColors() }
