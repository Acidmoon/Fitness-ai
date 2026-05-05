package com.fitnessai.android.ui.auth

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.fitnessai.android.data.model.UserRole
import com.fitnessai.android.ui.components.LineCard

@Composable
fun RoleSelectionScreen(onRoleSelected: (UserRole) -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        verticalArrangement = Arrangement.Center
    ) {
        Text("选择角色", style = MaterialTheme.typography.displaySmall)
        Text(
            "内部测试身份",
            modifier = Modifier.padding(top = 6.dp, bottom = 22.dp),
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        UserRole.entries.forEach { role ->
            LineCard(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 12.dp)
                    .clickable { onRoleSelected(role) }
            ) {
                Text(role.label, style = MaterialTheme.typography.titleMedium)
                Text(
                    roleDescription(role),
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}

private fun roleDescription(role: UserRole): String = when (role) {
    UserRole.Student -> "训练记录与体测视角"
    UserRole.Teacher -> "班级指导视角占位"
    UserRole.Administrator -> "系统管理视角占位"
    UserRole.PersonalFitness -> "个人训练视角"
}
