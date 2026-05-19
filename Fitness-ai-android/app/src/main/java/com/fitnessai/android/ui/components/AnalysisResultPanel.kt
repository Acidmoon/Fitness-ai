package com.fitnessai.android.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.fitnessai.android.data.model.AnalysisStatus

@Composable
fun AnalysisResultPanel(
    display: AnalysisDisplayState,
    analyzing: Boolean,
    scoring: Boolean,
    canStart: Boolean,
    apiMode: Boolean,
    onStart: () -> Unit,
    onScorePose: (Boolean) -> Unit,
    modifier: Modifier = Modifier
) {
    var detailsExpanded by remember { mutableStateOf(false) }
    var feedbackExpanded by remember { mutableStateOf(false) }
    val feedback = if (feedbackExpanded) display.feedback else display.feedback.take(5)

    LineCard(modifier = modifier.fillMaxWidth()) {
        Text("姿态分析", style = MaterialTheme.typography.titleMedium)
        if (analyzing) LoadingState("正在分析")
        if (scoring) LoadingState("正在评分")

        when (display.status) {
            AnalysisStatus.Idle -> Text("视频添加后可开始分析", color = MaterialTheme.colorScheme.onSurfaceVariant)
            AnalysisStatus.Queued -> LoadingState("分析任务排队中")
            AnalysisStatus.Running -> LoadingState("分析中")
            AnalysisStatus.Failed -> {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Icon(Icons.Outlined.ErrorOutline, contentDescription = "", tint = MaterialTheme.colorScheme.error)
                    Text(display.errorMessage ?: "分析失败", color = MaterialTheme.colorScheme.error)
                }
            }
            AnalysisStatus.Completed -> {
                display.errorMessage?.let {
                    Text(it, color = MaterialTheme.colorScheme.error)
                }
                if (display.errorMessage == null) {
                    Text(
                        "${display.score ?: 0} 分 · ${display.grade?.label ?: "待提升"}",
                        style = MaterialTheme.typography.headlineSmall
                    )
                    display.averageConfidence?.let { confidence ->
                        ProgressLine("平均置信度", confidence)
                    }
                    display.validFrameRatio?.let { ratio ->
                        ProgressLine("有效帧比例", ratio)
                    }
                    if (feedback.isNotEmpty()) {
                        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            feedback.forEach { item -> Text("• $item") }
                            if (display.feedback.size > 5) {
                                OutlinedButton(onClick = { feedbackExpanded = !feedbackExpanded }) {
                                    Text(if (feedbackExpanded) "收起" else "查看更多")
                                }
                            }
                        }
                    }
                }
                OutlinedButton(onClick = { detailsExpanded = !detailsExpanded }) {
                    Text(if (detailsExpanded) "收起详细数据" else "详细数据")
                }
                AnimatedVisibility(detailsExpanded) {
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text("模型 ${display.rawDetails.modelName ?: "-"}")
                        Text("有效帧 ${display.rawDetails.validFrameCount ?: 0}")
                        Text("平均置信度 ${display.rawDetails.averageConfidence ?: "-"}")
                        Text("预览次数 ${display.rawDetails.countPreview ?: "-"}")
                    }
                }
            }
        }

        Button(
            onClick = onStart,
            enabled = canStart,
            modifier = Modifier.fillMaxWidth()
        ) {
            Text(if (display.status == AnalysisStatus.Failed) "重新分析" else "开始分析")
        }
        if (apiMode && display.status == AnalysisStatus.Completed && display.errorMessage == null) {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedButton(
                    onClick = { onScorePose(false) },
                    enabled = !analyzing && !scoring,
                    modifier = Modifier.weight(1f)
                ) {
                    Text("评分预览")
                }
                Button(
                    onClick = { onScorePose(true) },
                    enabled = !analyzing && !scoring,
                    modifier = Modifier.weight(1f)
                ) {
                    Text("应用评分")
                }
            }
        }
    }
}

@Composable
private fun ProgressLine(label: String, value: Double) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text("$label ${(value * 100).toInt().coerceIn(0, 100)}%")
        LinearProgressIndicator(
            progress = { value.toFloat().coerceIn(0f, 1f) },
            modifier = Modifier.fillMaxWidth().padding(bottom = 4.dp)
        )
    }
}
