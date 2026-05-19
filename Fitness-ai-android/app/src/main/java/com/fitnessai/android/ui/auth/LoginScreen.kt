package com.fitnessai.android.ui.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Login
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.fitnessai.android.core.network.LocalNetworkMonitor
import com.fitnessai.android.ui.components.ErrorState
import com.fitnessai.android.ui.theme.AppIllustrations

@Composable
fun LoginScreen(
    viewModel: LoginViewModel,
    onLoggedIn: () -> Unit,
    onRegister: () -> Unit
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val online by LocalNetworkMonitor.current.isOnline.collectAsStateWithLifecycle()

    LaunchedEffect(state.loggedIn) {
        if (state.loggedIn) {
            viewModel.consumeLoggedIn()
            onLoggedIn()
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Icon(
            imageVector = AppIllustrations.AppLogo,
            contentDescription = "Fitness AI 标识",
            tint = MaterialTheme.colorScheme.primary
        )
        Text(
            "Fitness AI",
            style = MaterialTheme.typography.displaySmall,
            modifier = Modifier.padding(top = 12.dp)
        )
        Text(
            "智能训练记录与姿态分析",
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 6.dp, bottom = 28.dp)
        )

        OutlinedTextField(
            value = state.username,
            onValueChange = viewModel::onUsernameChange,
            modifier = Modifier.fillMaxWidth(),
            enabled = !state.submitting,
            label = { Text("用户名") },
            singleLine = true,
            isError = state.usernameError != null,
            supportingText = state.usernameError?.let { { Text(it) } }
        )
        OutlinedTextField(
            value = state.password,
            onValueChange = viewModel::onPasswordChange,
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 12.dp),
            enabled = !state.submitting,
            label = { Text("密码") },
            singleLine = true,
            isError = state.passwordError != null,
            supportingText = state.passwordError?.let { { Text(it) } },
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password)
        )

        state.errorMessage?.let { errorMessage ->
            Spacer(Modifier.height(12.dp))
            ErrorState(message = errorMessage)
        }

        if (!online) {
            Spacer(Modifier.height(12.dp))
            Text(
                "当前无网络连接，恢复后即可登录",
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }

        Button(
            onClick = viewModel::submit,
            enabled = state.canSubmit && online,
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 18.dp)
        ) {
            if (state.submitting) {
                CircularProgressIndicator(modifier = Modifier.height(20.dp))
            } else {
                Icon(Icons.Outlined.Login, contentDescription = null)
                Text("登录", modifier = Modifier.padding(start = 8.dp))
            }
        }
        TextButton(
            onClick = onRegister,
            enabled = !state.submitting,
            modifier = Modifier.fillMaxWidth()
        ) {
            Text("立即注册")
        }
    }
}
