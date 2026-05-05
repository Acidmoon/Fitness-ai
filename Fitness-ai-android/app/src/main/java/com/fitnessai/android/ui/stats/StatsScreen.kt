package com.fitnessai.android.ui.stats

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
import com.fitnessai.android.data.model.StatsSummary
import com.fitnessai.android.ui.components.EmptyState
import com.fitnessai.android.ui.components.LineCard

@Composable
fun StatsScreen(stats: StatsSummary) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        Text("统计", style = MaterialTheme.typography.displaySmall)
        if (stats.totalRecords == 0) {
            EmptyState(
                title = "暂无统计",
                message = "训练记录会生成总次数、总时长和最佳分数。"
            )
        } else {
            StatLine("训练记录", "${stats.totalRecords} 条")
            StatLine("累计次数", "${stats.totalCount} 次")
            StatLine("累计时长", "${stats.totalDurationSeconds} 秒")
            StatLine("最佳分数", stats.bestScore?.let { "$it 分" } ?: "-")
        }
    }
}

@Composable
private fun StatLine(label: String, value: String) {
    LineCard(modifier = Modifier.fillMaxWidth()) {
        Text(label, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, style = MaterialTheme.typography.headlineSmall)
    }
}
