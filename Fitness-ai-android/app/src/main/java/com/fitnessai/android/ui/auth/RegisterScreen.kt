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
import androidx.compose.material.icons.outlined.PersonAdd
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
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.fitnessai.android.core.network.LocalNetworkMonitor
import com.fitnessai.android.ui.components.ErrorState

@Composable
fun RegisterScreen(
    viewModel: RegisterViewModel,
    onRegistered: () -> Unit,
    onBackToLogin: () -> Unit
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val online by LocalNetworkMonitor.current.isOnline.collectAsStateWithLifecycle()

    LaunchedEffect(state.registered) {
        if (state.registered) {
            viewModel.consumeRegistered()
            onRegistered()
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        verticalArrangement = Arrangement.Center
    ) {
        Text("创建账号", style = MaterialTheme.typography.displaySmall)
        Text(
            "注册后自动登录 Fitness AI",
            modifier = Modifier.padding(top = 6.dp, bottom = 24.dp),
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )

        RegisterTextField(
            value = state.form.username,
            onValueChange = { viewModel.onFormChange(state.form.copy(username = it)) },
            label = "用户名",
            error = state.errors.username,
            enabled = !state.submitting
        )
        RegisterTextField(
            value = state.form.password,
            onValueChange = { viewModel.onFormChange(state.form.copy(password = it)) },
            label = "密码",
            error = state.errors.password,
            enabled = !state.submitting,
            password = true
        )
        RegisterTextField(
            value = state.form.confirmPassword,
            onValueChange = { viewModel.onFormChange(state.form.copy(confirmPassword = it)) },
            label = "确认密码",
            error = state.errors.confirmPassword,
            enabled = !state.submitting,
            password = true
        )
        RegisterTextField(
            value = state.form.email,
            onValueChange = { viewModel.onFormChange(state.form.copy(email = it)) },
            label = "邮箱（可选）",
            error = state.errors.email,
            enabled = !state.submitting,
            keyboardType = KeyboardType.Email
        )

        state.errorMessage?.let {
            Spacer(Modifier.height(12.dp))
            ErrorState(message = it)
        }

        if (!online) {
            Spacer(Modifier.height(12.dp))
            Text(
                "当前无网络连接，请先连接后再注册",
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }

        Button(
            onClick = viewModel::submit,
            enabled = state.canSubmit && online,
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 16.dp)
        ) {
            if (state.submitting) {
                CircularProgressIndicator(modifier = Modifier.height(20.dp))
            } else {
                Icon(Icons.Outlined.PersonAdd, contentDescription = null)
                Text("注册", modifier = Modifier.padding(start = 8.dp))
            }
        }
        TextButton(
            onClick = onBackToLogin,
            enabled = !state.submitting,
            modifier = Modifier.fillMaxWidth()
        ) {
            Text("返回登录")
        }
    }
}

@Composable
private fun RegisterTextField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    error: String?,
    enabled: Boolean,
    password: Boolean = false,
    keyboardType: KeyboardType = KeyboardType.Text
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 10.dp),
        enabled = enabled,
        label = { Text(label) },
        singleLine = true,
        isError = error != null,
        supportingText = error?.let { { Text(it) } },
        visualTransformation = if (password) PasswordVisualTransformation() else VisualTransformation.None,
        keyboardOptions = KeyboardOptions(keyboardType = keyboardType)
    )
}
