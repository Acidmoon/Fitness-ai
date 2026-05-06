package com.fitnessai.android.ui.training

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.fitnessai.android.app.ApiOperationState
import com.fitnessai.android.data.model.AnalysisStatus
import com.fitnessai.android.data.model.TrainingRecord
import com.fitnessai.android.ui.components.EmptyState
import com.fitnessai.android.ui.components.ErrorState
import com.fitnessai.android.ui.components.LineCard
import com.fitnessai.android.ui.components.LoadingState

@Composable
fun TrainingListScreen(
    records: List<TrainingRecord>,
    operation: ApiOperationState = ApiOperationState.Ready,
    onRetry: () -> Unit = {},
    onCreate: () -> Unit,
    onOpenRecord: (String) -> Unit
) {
    val actionsEnabled = operation !is ApiOperationState.Loading &&
        operation !is ApiOperationState.Refreshing &&
        operation !is ApiOperationState.Unauthenticated
    Scaffold(
        floatingActionButton = {
            FloatingActionButton(onClick = { if (actionsEnabled) onCreate() }) {
                Icon(Icons.Outlined.Add, contentDescription = "新建")
            }
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            Text("训练", style = MaterialTheme.typography.displaySmall)
            when (operation) {
                ApiOperationState.Loading -> {
                    LoadingState("正在加载训练记录")
                    return@Column
                }
                ApiOperationState.Refreshing -> LoadingState("正在刷新训练记录")
                is ApiOperationState.RecoverableError -> {
                    ErrorState(message = operation.message, onRetry = onRetry)
                    return@Column
                }
                ApiOperationState.Unauthenticated -> {
                    ErrorState(message = "登录状态已失效，请重新登录")
                    return@Column
                }
                ApiOperationState.Empty,
                ApiOperationState.Ready -> Unit
            }
            if (records.isEmpty()) {
                EmptyState(
                    title = "暂无训练记录",
                    message = "记录动作、次数和视频后，可继续进行模拟分析。",
                    actionLabel = "新建记录",
                    onAction = onCreate
                )
            } else {
                LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    items(records, key = { it.id }) { record ->
                        TrainingRecordRow(record = record, onClick = { onOpenRecord(record.id) })
                    }
                }
            }
        }
    }
}

@Composable
private fun TrainingRecordRow(record: TrainingRecord, onClick: () -> Unit) {
    val stateLabel = when (record.analysisResult.status) {
        AnalysisStatus.Idle -> if (record.videoUri == null) "未添加视频" else "可分析"
        AnalysisStatus.Queued -> "排队中"
        AnalysisStatus.Running -> "分析中"
        AnalysisStatus.Completed -> "已完成"
        AnalysisStatus.Failed -> "失败"
    }
    LineCard(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
    ) {
        Text(record.exerciseName, style = MaterialTheme.typography.titleMedium)
        Text(
            "${record.category} · ${record.count} 次 · ${record.score?.let { "$it 分" } ?: "未评分"}",
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Text(
            "${record.dateLabel} · $stateLabel",
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}
