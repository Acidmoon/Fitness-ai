package com.fitnessai.android.ui.training

import androidx.compose.animation.core.tween
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
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.fitnessai.android.app.ApiOperationState
import com.fitnessai.android.data.model.AnalysisStatus
import com.fitnessai.android.data.model.TrainingRecord
import com.fitnessai.android.ui.components.AppPullToRefreshBox
import com.fitnessai.android.ui.components.EmptyState
import com.fitnessai.android.ui.components.LineCard
import com.fitnessai.android.ui.components.StateView
import com.fitnessai.android.ui.settings.LocalReducedMotion
import com.fitnessai.android.ui.theme.AppIllustrations
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.distinctUntilChanged

@OptIn(FlowPreview::class, ExperimentalMaterial3Api::class)
@Composable
fun TrainingListScreen(
    records: List<TrainingRecord>,
    operation: ApiOperationState = ApiOperationState.Ready,
    onRetry: () -> Unit = {},
    onRefresh: () -> Unit = onRetry,
    onCreate: () -> Unit,
    onOpenRecord: (String) -> Unit
) {
    var query by remember { mutableStateOf("") }
    var debouncedQuery by remember { mutableStateOf("") }
    var category by remember { mutableStateOf(ALL_CATEGORIES) }
    var sort by remember { mutableStateOf(SortOrder.DateDesc) }

    LaunchedEffect(Unit) {
        snapshotFlow { query }
            .debounce(300)
            .distinctUntilChanged()
            .collect { debouncedQuery = it }
    }

    val filterState = FilterState(query = debouncedQuery, category = category, sort = sort)
    val displayedRecords = remember(records, filterState) {
        RecordFilter.apply(records, filterState)
    }
    val actionsEnabled = operation !is ApiOperationState.Loading &&
        operation !is ApiOperationState.Refreshing &&
        operation !is ApiOperationState.Unauthenticated
    val reducedMotion = LocalReducedMotion.current

    Scaffold(
        floatingActionButton = {
            FloatingActionButton(onClick = { if (actionsEnabled) onCreate() }) {
                Icon(Icons.Outlined.Add, contentDescription = "新建训练")
            }
        }
    ) { padding ->
        AppPullToRefreshBox(
            isRefreshing = operation is ApiOperationState.Refreshing,
            onRefresh = onRefresh,
            modifier = Modifier.padding(padding)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(18.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                Text("训练", style = MaterialTheme.typography.displaySmall)
                RecordFilterBar(
                    state = FilterState(query = query, category = category, sort = sort),
                    categories = records.map { it.category },
                    onStateChange = { next ->
                        query = next.query
                        category = next.category
                        sort = next.sort
                    }
                )
                StateView(
                    state = operation,
                    loadingMessage = "正在加载训练记录",
                    onRetry = onRetry,
                    empty = {
                        EmptyState(
                            title = "暂无训练记录",
                            message = "记录动作、次数和视频后，可继续进行模拟分析。",
                            actionLabel = "新建记录",
                            onAction = onCreate
                        )
                    }
                ) {
                    if (displayedRecords.isEmpty() && records.isNotEmpty()) {
                        EmptyState(
                            title = "未找到匹配记录",
                            message = "请调整搜索或筛选条件。",
                            illustration = AppIllustrations.EmptySearch,
                            actionLabel = "清除筛选",
                            onAction = {
                                query = ""
                                category = ALL_CATEGORIES
                                sort = SortOrder.DateDesc
                            }
                        )
                    } else {
                        LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                            items(displayedRecords, key = { it.id }) { record ->
                                TrainingRecordRow(
                                    record = record,
                                    onClick = { onOpenRecord(record.id) },
                                    modifier = if (reducedMotion) Modifier else Modifier.animateItem()
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun TrainingRecordRow(
    record: TrainingRecord,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val stateLabel = when (record.analysisResult.status) {
        AnalysisStatus.Idle -> if (record.videoUri == null) "未添加视频" else "可分析"
        AnalysisStatus.Queued -> "排队中"
        AnalysisStatus.Running -> "分析中"
        AnalysisStatus.Completed -> "已完成"
        AnalysisStatus.Failed -> "失败"
    }
    LineCard(
        modifier = modifier
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
