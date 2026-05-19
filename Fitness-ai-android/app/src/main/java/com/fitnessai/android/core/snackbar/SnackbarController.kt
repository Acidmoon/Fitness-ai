package com.fitnessai.android.core.snackbar

import androidx.compose.runtime.staticCompositionLocalOf
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.channels.ReceiveChannel

enum class SnackbarLevel {
    Info,
    Warning,
    Error
}

data class SnackbarMessage(
    val text: String,
    val level: SnackbarLevel = SnackbarLevel.Info,
    val actionLabel: String? = null,
    val onAction: (() -> Unit)? = null
)

class SnackbarController {
    private val channel = Channel<SnackbarMessage>(capacity = Channel.BUFFERED)
    val messages: ReceiveChannel<SnackbarMessage> = channel

    fun enqueue(message: SnackbarMessage) {
        channel.trySend(message)
    }

    fun info(text: String) = enqueue(SnackbarMessage(text, SnackbarLevel.Info))
    fun warning(text: String) = enqueue(SnackbarMessage(text, SnackbarLevel.Warning))
    fun error(text: String) = enqueue(SnackbarMessage(text, SnackbarLevel.Error))
}

val LocalSnackbarController = staticCompositionLocalOf<SnackbarController> {
    error("SnackbarController not provided")
}
