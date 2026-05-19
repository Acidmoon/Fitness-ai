package com.fitnessai.android.ui.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.fitnessai.android.BuildConfig
import com.fitnessai.android.core.network.LocalNetworkMonitor
import com.fitnessai.android.core.theme.ThemeMode
import com.fitnessai.android.ui.components.LineCard

@Composable
fun SettingsScreen(
    viewModel: SettingsViewModel,
    onBack: () -> Unit,
    onAbout: () -> Unit
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val online by LocalNetworkMonitor.current.isOnline.collectAsStateWithLifecycle()
    var showClearCache by remember { mutableStateOf(false) }
    var showLogout by remember { mutableStateOf(false) }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        item {
            Text("设置", style = MaterialTheme.typography.displaySmall)
        }

        item {
            LineCard(modifier = Modifier.fillMaxWidth()) {
                Text("账号", style = MaterialTheme.typography.titleMedium)
                OutlinedButton(onClick = { /* TODO */ }, modifier = Modifier.fillMaxWidth()) {
                    Text("修改密码")
                }
                Button(onClick = { showLogout = true }, modifier = Modifier.fillMaxWidth()) {
                    Text("退出登录")
                }
            }
        }

        item {
            LineCard(modifier = Modifier.fillMaxWidth()) {
                Text("外观", style = MaterialTheme.typography.titleMedium)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    ThemeMode.entries.forEach { mode ->
                        FilterChip(
                            selected = state.themeMode == mode,
                            onClick = { viewModel.setThemeMode(mode) },
                            label = {
                                Text(
                                    when (mode) {
                                        ThemeMode.System -> "跟随系统"
                                        ThemeMode.Light -> "浅色"
                                        ThemeMode.Dark -> "深色"
                                    }
                                )
                            }
                        )
                    }
                }
                Row(
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("减少动效")
                    Switch(
                        checked = state.reducedMotion,
                        onCheckedChange = viewModel::setReducedMotion
                    )
                }
            }
        }

        item {
            LineCard(modifier = Modifier.fillMaxWidth()) {
                Text("网络", style = MaterialTheme.typography.titleMedium)
                OutlinedTextField(
                    value = state.baseUrlInput,
                    onValueChange = viewModel::onBaseUrlInputChange,
                    label = { Text("API BaseUrl") },
                    isError = state.baseUrlError != null,
                    supportingText = state.baseUrlError?.let { { Text(it) } } ?: {
                        Text("当前: ${state.savedBaseUrl}", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    },
                    enabled = !state.saving,
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                Button(
                    onClick = viewModel::saveBaseUrl,
                    enabled = state.canSaveBaseUrl && online,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(if (state.saving) "保存中..." else "保存 API 配置")
                }
            }
        }

        item {
            LineCard(modifier = Modifier.fillMaxWidth()) {
                Text("数据", style = MaterialTheme.typography.titleMedium)
                OutlinedButton(
                    onClick = { showClearCache = true },
                    enabled = !state.clearingCache,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(if (state.clearingCache) "清除中..." else "清除缓存")
                }
            }
        }

        item {
            LineCard(modifier = Modifier.fillMaxWidth()) {
                Text("关于", style = MaterialTheme.typography.titleMedium)
                Text("版本 ${BuildConfig.VERSION_NAME}")
                OutlinedButton(onClick = onAbout, modifier = Modifier.fillMaxWidth()) {
                    Text("关于 Fitness AI")
                }
            }
        }

        item {
            TextButton(onClick = onBack, modifier = Modifier.fillMaxWidth()) {
                Text("返回")
            }
        }
    }

    if (showClearCache) {
        AlertDialog(
            onDismissRequest = { showClearCache = false },
            confirmButton = {
                TextButton(onClick = {
                    showClearCache = false
                    viewModel.clearCache()
                }) { Text("清除") }
            },
            dismissButton = { TextButton(onClick = { showClearCache = false }) { Text("取消") } },
            title = { Text("清除缓存") },
            text = { Text("将清理本地图片、视频和 HTTP 缓存。") }
        )
    }
    if (showLogout) {
        AlertDialog(
            onDismissRequest = { showLogout = false },
            confirmButton = {
                TextButton(onClick = {
                    showLogout = false
                    viewModel.logout()
                }) { Text("退出") }
            },
            dismissButton = { TextButton(onClick = { showLogout = false }) { Text("取消") } },
            title = { Text("退出登录") },
            text = { Text("确认退出当前账号？") }
        )
    }
}
