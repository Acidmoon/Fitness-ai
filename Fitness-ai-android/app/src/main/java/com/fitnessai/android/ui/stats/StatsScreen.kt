package com.fitnessai.android.ui.stats

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.fitnessai.android.app.ApiOperationState
import com.fitnessai.android.ui.components.AppPullToRefreshBox
import com.fitnessai.android.ui.components.EmptyState
import com.fitnessai.android.ui.components.LineCard
import com.fitnessai.android.ui.components.StateView
import com.fitnessai.android.ui.components.StatsChart
import com.fitnessai.android.ui.components.StatsPeriod

@Composable
fun StatsScreen(
    viewModel: StatsViewModel,
    operation: ApiOperationState,
    onRetry: () -> Unit,
    onRefresh: () -> Unit
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    AppPullToRefreshBox(
        isRefreshing = state.refreshing || operation is ApiOperationState.Refreshing,
        onRefresh = onRefresh
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            Text("统计", style = MaterialTheme.typography.displaySmall)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                StatsPeriod.entries.forEach { option ->
                    FilterChip(
                        selected = state.period == option,
                        onClick = { viewModel.selectPeriod(option) },
                        label = { Text(option.label) }
                    )
                }
            }
            StateView(
                state = operation,
                loadingMessage = "正在加载统计",
                onRetry = onRetry,
                empty = {
                    EmptyState(
                        title = "暂无统计",
                        message = "训练记录会生成总次数、总时长和最佳分数。"
                    )
                }
            ) {
                if (state.weeklyError != null && state.period == StatsPeriod.Week) {
                    LineCard(modifier = Modifier.fillMaxWidth()) {
                        Text("周趋势加载失败", style = MaterialTheme.typography.titleMedium)
                        Text(
                            state.weeklyError ?: "请稍后再试",
                            color = MaterialTheme.colorScheme.error
                        )
                        androidx.compose.material3.OutlinedButton(
                            onClick = viewModel::refreshWeekly,
                            modifier = Modifier.padding(top = 4.dp)
                        ) {
                            Text("重试")
                        }
                    }
                }
                StatsChart(buckets = state.buckets, period = state.period)
                StatLine("训练记录", "${state.summary.totalRecords} 条")
                StatLine("累计次数", "${state.summary.totalCount} 次")
                StatLine("累计时长", "${state.summary.totalDurationSeconds} 秒")
                StatLine("最佳分数", state.summary.bestScore?.let { "$it 分" } ?: "-")
            }
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
