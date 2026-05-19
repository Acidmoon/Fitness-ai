package com.fitnessai.android.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.dp
import com.fitnessai.android.ui.theme.AppIllustrations
import java.time.LocalDate
import java.time.format.DateTimeFormatter

data class TrendPoint(
    val date: LocalDate,
    val sessions: Int,
    val durationSeconds: Int
)

enum class TrendMetric {
    Sessions,
    DurationSeconds
}

@Composable
fun TrendChart(
    points: List<TrendPoint>,
    metric: TrendMetric = TrendMetric.Sessions,
    modifier: Modifier = Modifier
) {
    val values = points.map { if (metric == TrendMetric.Sessions) it.sessions else it.durationSeconds }
    if (points.isEmpty() || values.all { it == 0 }) {
        EmptyState(
            title = "暂无近 7 日数据",
            message = "完成训练后，这里会显示最近一周趋势。",
            illustration = AppIllustrations.EmptyTrainings,
            modifier = modifier
        )
        return
    }

    var selected by remember { mutableStateOf(points.last()) }
    val primary = MaterialTheme.colorScheme.primary
    val outline = MaterialTheme.colorScheme.outline
    val maxValue = values.maxOrNull()?.coerceAtLeast(1) ?: 1
    val formatter = remember { DateTimeFormatter.ofPattern("MM/dd") }

    LineCard(modifier = modifier.fillMaxWidth()) {
        Text("近 7 日趋势", style = MaterialTheme.typography.titleMedium)
        Canvas(
            modifier = Modifier
                .fillMaxWidth()
                .height(160.dp)
                .clickable {
                    val index = points.indexOf(selected)
                    selected = points[(index + 1).mod(points.size)]
                }
        ) {
            val chartHeight = size.height - 24.dp.toPx()
            val stepX = if (points.size <= 1) size.width else size.width / (points.size - 1)
            repeat(4) { tick ->
                val y = chartHeight - chartHeight * tick / 3f
                drawLine(outline, Offset(0f, y), Offset(size.width, y), strokeWidth = 1.dp.toPx())
            }
            val path = Path()
            points.forEachIndexed { index, point ->
                val value = if (metric == TrendMetric.Sessions) point.sessions else point.durationSeconds
                val x = index * stepX
                val y = chartHeight - (value.toFloat() / maxValue) * chartHeight
                if (index == 0) path.moveTo(x, y) else path.lineTo(x, y)
                drawCircle(primary, radius = 4.dp.toPx(), center = Offset(x, y))
            }
            drawPath(path, color = primary, style = Stroke(width = 3.dp.toPx(), cap = StrokeCap.Round))
        }
        Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
            points.forEach { point ->
                Text(point.date.format(formatter), style = MaterialTheme.typography.labelSmall)
            }
        }
        Text(
            "${selected.date.format(formatter)}：${selected.sessions} 次，${selected.durationSeconds} 秒",
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}
