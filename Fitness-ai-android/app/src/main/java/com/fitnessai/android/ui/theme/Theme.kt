package com.fitnessai.android.ui.theme

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import com.fitnessai.android.core.theme.ThemeMode

@Composable
fun FitnessAiTheme(
    themeMode: ThemeMode = ThemeMode.System,
    content: @Composable () -> Unit
) {
    val useDark = when (themeMode) {
        ThemeMode.System -> isSystemInDarkTheme()
        ThemeMode.Light -> false
        ThemeMode.Dark -> true
    }
    val target = if (useDark) DarkColors else LightColors
    val colors = target.animated()
    CompositionLocalProvider(
        LocalAppSpacing provides AppSpacing(),
        LocalAppShapes provides AppShapes(),
        LocalAppElevation provides AppElevation(),
        LocalAppSemanticColors provides AppSemanticColors()
    ) {
        MaterialTheme(
            colorScheme = colors,
            typography = AppTypography,
            content = content
        )
    }
}

@Composable
private fun ColorScheme.animated(): ColorScheme {
    val animation = tween<androidx.compose.ui.graphics.Color>(durationMillis = 250)
    return copy(
        primary = animateColorAsState(primary, animation, label = "primary").value,
        onPrimary = animateColorAsState(onPrimary, animation, label = "onPrimary").value,
        primaryContainer = animateColorAsState(primaryContainer, animation, label = "primaryContainer").value,
        onPrimaryContainer = animateColorAsState(onPrimaryContainer, animation, label = "onPrimaryContainer").value,
        secondary = animateColorAsState(secondary, animation, label = "secondary").value,
        onSecondary = animateColorAsState(onSecondary, animation, label = "onSecondary").value,
        secondaryContainer = animateColorAsState(secondaryContainer, animation, label = "secondaryContainer").value,
        onSecondaryContainer = animateColorAsState(onSecondaryContainer, animation, label = "onSecondaryContainer").value,
        tertiary = animateColorAsState(tertiary, animation, label = "tertiary").value,
        onTertiary = animateColorAsState(onTertiary, animation, label = "onTertiary").value,
        tertiaryContainer = animateColorAsState(tertiaryContainer, animation, label = "tertiaryContainer").value,
        onTertiaryContainer = animateColorAsState(onTertiaryContainer, animation, label = "onTertiaryContainer").value,
        background = animateColorAsState(background, animation, label = "background").value,
        onBackground = animateColorAsState(onBackground, animation, label = "onBackground").value,
        surface = animateColorAsState(surface, animation, label = "surface").value,
        onSurface = animateColorAsState(onSurface, animation, label = "onSurface").value,
        surfaceVariant = animateColorAsState(surfaceVariant, animation, label = "surfaceVariant").value,
        onSurfaceVariant = animateColorAsState(onSurfaceVariant, animation, label = "onSurfaceVariant").value,
        outline = animateColorAsState(outline, animation, label = "outline").value,
        error = animateColorAsState(error, animation, label = "error").value,
        onError = animateColorAsState(onError, animation, label = "onError").value
    )
}
