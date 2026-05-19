package com.fitnessai.android.ui.about

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.fitnessai.android.BuildConfig
import com.fitnessai.android.ui.components.LineCard

private const val FEEDBACK_EMAIL = "feedback@fitness-ai.local"

@Composable
fun AboutScreen(onBack: () -> Unit) {
    val context = LocalContext.current
    var showLicenses by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }

    Column(
        modifier = Modifier.fillMaxSize().padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        Text("关于", style = MaterialTheme.typography.displaySmall)
        LineCard(modifier = Modifier.fillMaxWidth()) {
            Icon(Icons.Outlined.Info, contentDescription = "应用信息", tint = MaterialTheme.colorScheme.primary)
            Text("Fitness AI", style = MaterialTheme.typography.headlineSmall)
            Text("版本 ${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})")
            Text("大学生创新训练计划项目移动端")
            Text("Copyright 2026 Fitness AI Team. All rights reserved.")
        }
        OutlinedButton(onClick = { showLicenses = !showLicenses }, modifier = Modifier.fillMaxWidth()) {
            Text("开源许可")
        }
        if (showLicenses) {
            LineCard(modifier = Modifier.fillMaxWidth()) {
                Text("Jetpack Compose - Apache License 2.0")
                Text("Retrofit / OkHttp - Apache License 2.0")
                Text("Kotlinx Serialization - Apache License 2.0")
            }
        }
        Button(
            onClick = {
                val intent = Intent(Intent.ACTION_SENDTO).apply {
                    data = Uri.parse("mailto:$FEEDBACK_EMAIL")
                    putExtra(Intent.EXTRA_SUBJECT, "Fitness AI 反馈")
                }
                if (intent.resolveActivity(context.packageManager) == null) {
                    message = "未找到邮件客户端"
                } else {
                    context.startActivity(intent)
                }
            },
            modifier = Modifier.fillMaxWidth()
        ) {
            Text("反馈")
        }
        message?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        TextButton(onClick = onBack, modifier = Modifier.fillMaxWidth()) {
            Text("返回")
        }
    }
}
