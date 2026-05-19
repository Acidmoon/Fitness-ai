package com.fitnessai.android.ui.profile

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Logout
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material3.AlertDialog
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
import androidx.compose.ui.unit.dp
import com.fitnessai.android.data.model.UserSession
import com.fitnessai.android.ui.components.LineCard

@Composable
fun ProfileScreen(
    session: UserSession?,
    onSettings: () -> Unit = {},
    onAbout: () -> Unit = {},
    onLogout: () -> Unit
) {
    var showLogout by remember { mutableStateOf(false) }
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        Text("我的", style = MaterialTheme.typography.displaySmall)
        LineCard(modifier = Modifier.fillMaxWidth()) {
            Text(session?.displayName ?: "-", style = MaterialTheme.typography.headlineSmall)
            Text(
                session?.role?.label ?: "未选择角色",
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        ProfileAction("设置", Icons.Outlined.Settings, onSettings)
        ProfileAction("关于", Icons.Outlined.Info, onAbout)
        ProfileAction("修改密码", Icons.Outlined.Lock) { }
        Button(onClick = { showLogout = true }, modifier = Modifier.fillMaxWidth()) {
            Icon(Icons.Outlined.Logout, contentDescription = "")
            Text("退出登录", modifier = Modifier.padding(start = 8.dp))
        }
    }
    if (showLogout) {
        AlertDialog(
            onDismissRequest = { showLogout = false },
            confirmButton = {
                TextButton(onClick = {
                    showLogout = false
                    onLogout()
                }) { Text("退出") }
            },
            dismissButton = { TextButton(onClick = { showLogout = false }) { Text("取消") } },
            title = { Text("退出登录") },
            text = { Text("确认退出当前账号？") }
        )
    }
}

@Composable
private fun ProfileAction(
    label: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    onClick: () -> Unit
) {
    OutlinedButton(onClick = onClick, modifier = Modifier.fillMaxWidth()) {
        Icon(icon, contentDescription = "")
        Text(label, modifier = Modifier.padding(start = 8.dp))
    }
}
