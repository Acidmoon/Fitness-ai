package com.fitnessai.android.ui.home

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.fitnessai.android.app.HomeState
import com.fitnessai.android.ui.components.EmptyState
import com.fitnessai.android.ui.components.LineCard

@Composable
fun HomeScreen(
    state: HomeState,
    onOpenTraining: () -> Unit,
    onOpenRecord: (String) -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        Text("首页", style = MaterialTheme.typography.displaySmall)
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            MetricCard("记录", state.summary.totalRecords.toString(), Modifier.weight(1f))
            MetricCard("次数", state.summary.totalCount.toString(), Modifier.weight(1f))
            MetricCard("最佳", state.summary.bestScore?.toString() ?: "-", Modifier.weight(1f))
        }
        if (state.recentRecords.isEmpty()) {
            EmptyState(
                title = "暂无训练",
                message = "创建第一条训练记录后，这里会展示最近活动。",
                actionLabel = "新建记录",
                onAction = onOpenTraining
            )
        } else {
            Text("最近训练", style = MaterialTheme.typography.titleMedium)
            state.recentRecords.forEach { record ->
                LineCard(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { onOpenRecord(record.id) }
                ) {
                    Text(record.exerciseName, style = MaterialTheme.typography.titleMedium)
                    Text(
                        "${record.category} · ${record.count} 次 · ${record.dateLabel}",
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
            Button(onClick = onOpenTraining, modifier = Modifier.fillMaxWidth()) {
                Text("查看训练")
            }
        }
    }
}

@Composable
private fun MetricCard(label: String, value: String, modifier: Modifier = Modifier) {
    LineCard(modifier = modifier) {
        Text(label, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, style = MaterialTheme.typography.headlineSmall)
    }
}
