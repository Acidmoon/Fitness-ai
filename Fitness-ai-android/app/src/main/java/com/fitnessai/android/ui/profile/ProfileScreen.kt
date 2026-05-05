package com.fitnessai.android.ui.profile

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Logout
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.fitnessai.android.data.model.UserSession
import com.fitnessai.android.ui.components.LineCard

@Composable
fun ProfileScreen(
    session: UserSession?,
    onLogout: () -> Unit
) {
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
        Button(onClick = onLogout, modifier = Modifier.fillMaxWidth()) {
            Icon(Icons.Outlined.Logout, contentDescription = null)
            Text("退出登录", modifier = Modifier.padding(start = 8.dp))
        }
    }
}
