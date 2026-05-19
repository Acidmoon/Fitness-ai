package com.fitnessai.android.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import com.fitnessai.android.app.ApiOperationState
import com.fitnessai.android.core.session.LocalSessionManager
import com.fitnessai.android.ui.theme.AppIllustrations

@Composable
fun LineCard(
    modifier: Modifier = Modifier,
    contentPadding: PaddingValues = PaddingValues(16.dp),
    content: @Composable ColumnScope.() -> Unit
) {
    Card(
        modifier = modifier,
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
        content = {
            Column(
                modifier = Modifier.padding(contentPadding),
                verticalArrangement = Arrangement.spacedBy(10.dp),
                content = content
            )
        }
    )
}

@Composable
fun EmptyState(
    title: String,
    message: String,
    illustration: ImageVector = AppIllustrations.EmptyTrainings,
    actionLabel: String? = null,
    onAction: (() -> Unit)? = null,
    modifier: Modifier = Modifier
) {
    LineCard(modifier = modifier.fillMaxWidth()) {
        Icon(
            imageVector = illustration,
            contentDescription = "",
            tint = MaterialTheme.colorScheme.primary
        )
        Text(title, style = MaterialTheme.typography.titleMedium)
        Text(
            message,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        if (actionLabel != null && onAction != null) {
            OutlinedButton(onClick = onAction) {
                Text(actionLabel)
            }
        }
    }
}

@Composable
fun ErrorState(
    message: String,
    onRetry: (() -> Unit)? = null,
    illustration: ImageVector = AppIllustrations.GenericError
) {
    LineCard(modifier = Modifier.fillMaxWidth()) {
        Icon(
            imageVector = illustration,
            contentDescription = "",
            tint = MaterialTheme.colorScheme.error
        )
        Text("操作未完成", style = MaterialTheme.typography.titleMedium)
        Text(
            message,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.error
        )
        if (onRetry != null) {
            Button(onClick = onRetry) {
                Text("重试")
            }
        }
    }
}

@Composable
fun LoadingState(message: String) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        CircularProgressIndicator()
        Text(message, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
fun StateView(
    state: ApiOperationState,
    loadingMessage: String,
    onRetry: () -> Unit,
    empty: @Composable () -> Unit,
    content: @Composable () -> Unit
) {
    val sessionManager = LocalSessionManager.current
    when (state) {
        ApiOperationState.Loading -> LoadingState(loadingMessage)
        is ApiOperationState.RecoverableError -> ErrorState(message = state.message, onRetry = onRetry)
        ApiOperationState.Unauthenticated -> {
            LaunchedEffect(Unit) { sessionManager?.notifyUnauthorized() }
            ErrorState(message = "登录已失效，请重新登录")
        }
        ApiOperationState.Empty -> empty()
        ApiOperationState.Ready -> content()
        ApiOperationState.Refreshing -> {
            Box {
                content()
                LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
            }
        }
    }
}
