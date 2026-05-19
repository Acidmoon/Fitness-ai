package com.fitnessai.android.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.unit.dp
import com.fitnessai.android.ui.theme.AppIllustrations

enum class StatsPeriod(val label: String) {
    Week("周"),
    Month("月"),
    Year("年")
}

data class StatsBucket(
    val label: String,
    val sessions: Int
)

@Composable
fun StatsChart(
    buckets: List<StatsBucket>,
    period: StatsPeriod,
    modifier: Modifier = Modifier
) {
    if (buckets.isEmpty() || buckets.all { it.sessions == 0 }) {
        EmptyState(
            title = "暂无统计数据",
            message = "当前周期没有训练记录。",
            illustration = AppIllustrations.EmptyStats,
            modifier = modifier
        )
        return
    }

    val primary = MaterialTheme.colorScheme.primary
    val outline = MaterialTheme.colorScheme.outline
    val maxValue = buckets.maxOf { it.sessions }.coerceAtLeast(1)
    LineCard(modifier = modifier.fillMaxWidth()) {
        Text("${period.label}训练分布", style = MaterialTheme.typography.titleMedium)
        Canvas(modifier = Modifier.fillMaxWidth().height(160.dp)) {
            val gap = 4.dp.toPx()
            val barWidth = (size.width - gap * (buckets.size - 1)) / buckets.size
            val chartHeight = size.height - 16.dp.toPx()
            drawLine(outline, Offset(0f, chartHeight), Offset(size.width, chartHeight), 1.dp.toPx())
            buckets.forEachIndexed { index, bucket ->
                val left = index * (barWidth + gap)
                val height = chartHeight * bucket.sessions / maxValue
                drawRect(
                    color = primary,
                    topLeft = Offset(left, chartHeight - height),
                    size = Size(barWidth.coerceAtLeast(2.dp.toPx()), height)
                )
            }
        }
    }
}
