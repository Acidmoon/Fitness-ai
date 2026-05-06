package com.fitnessai.android.ui.training

import android.Manifest
import android.net.Uri
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.PhotoLibrary
import androidx.compose.material.icons.outlined.PlayCircle
import androidx.compose.material.icons.outlined.Videocam
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.core.content.PermissionChecker
import com.fitnessai.android.app.ApiOperationState
import com.fitnessai.android.app.RecordActionState
import com.fitnessai.android.data.model.AnalysisStatus
import com.fitnessai.android.data.model.ExerciseCatalogItem
import com.fitnessai.android.data.model.RecordDraft
import com.fitnessai.android.data.model.TrainingRecord
import com.fitnessai.android.ui.components.EmptyState
import com.fitnessai.android.ui.components.ErrorState
import com.fitnessai.android.ui.components.LineCard
import com.fitnessai.android.ui.components.LoadingState
import com.fitnessai.android.ui.video.VideoPlayer

@Composable
fun RecordDetailScreen(
    record: TrainingRecord?,
    operation: ApiOperationState = ApiOperationState.Ready,
    actionState: RecordActionState = RecordActionState(),
    apiMode: Boolean = false,
    exerciseOptions: List<ExerciseCatalogItem> = emptyList(),
    onBack: () -> Unit,
    onRetryLoad: () -> Unit = {},
    onClearActionError: () -> Unit = {},
    onSave: (RecordDraft, (Boolean, String?) -> Unit) -> Unit,
    onDelete: () -> Unit,
    onPickVideo: (Uri) -> Unit,
    onRecordVideo: () -> Unit,
    onStartAnalysis: ((String?) -> Unit) -> Unit,
    onScorePose: (Boolean, (String?) -> Unit) -> Unit = { _, onResult -> onResult(null) }
) {
    if (record == null) {
        Column(modifier = Modifier.fillMaxSize().padding(18.dp)) {
            when (operation) {
                ApiOperationState.Loading,
                ApiOperationState.Refreshing -> LoadingState("正在加载记录")
                is ApiOperationState.RecoverableError -> ErrorState(
                    message = operation.message,
                    onRetry = onRetryLoad
                )
                ApiOperationState.Unauthenticated -> ErrorState(message = "登录状态已失效，请重新登录")
                ApiOperationState.Empty,
                ApiOperationState.Ready -> EmptyState(title = "记录不存在", message = "该训练记录已删除或不可用。")
            }
            Button(onClick = onBack, modifier = Modifier.padding(top = 12.dp)) {
                Text("返回")
            }
        }
        return
    }

    var editing by remember { mutableStateOf(false) }
    var showDelete by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }
    val actionsEnabled = !actionState.isBusy && operation !is ApiOperationState.Unauthenticated
    val context = LocalContext.current
    val cameraPermission = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) onRecordVideo() else message = "相机权限未开启"
    }
    val notificationPermission = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) {
        onStartAnalysis { error -> message = error }
    }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) {
            onPickVideo(uri)
            message = "视频已更新"
        }
    }

    if (editing) {
        RecordEditorScreen(
            title = "编辑训练",
            initial = record,
            apiMode = apiMode,
            exerciseOptions = exerciseOptions,
            saving = actionState.saving,
            onBack = { editing = false },
            onSave = { draft, onResult ->
                onSave(draft) { saved, error ->
                    if (saved) editing = false
                    onResult(saved, error)
                }
            }
        )
        return
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        Row {
            IconButton(onClick = onBack) {
                Icon(Icons.Outlined.ArrowBack, contentDescription = "返回")
            }
            Text(record.exerciseName, style = MaterialTheme.typography.displaySmall)
        }
        LineCard(modifier = Modifier.fillMaxWidth()) {
            Text("${record.category} · ${record.count} 次", style = MaterialTheme.typography.titleMedium)
            Text("记录时间 ${record.dateLabel}", color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text("分数 ${record.score?.toString() ?: "-"}", color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text("时长 ${record.durationSeconds?.let { "$it 秒" } ?: "-"}", color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            OutlinedButton(
                onClick = { editing = true },
                modifier = Modifier.weight(1f),
                enabled = actionsEnabled
            ) {
                Text("编辑")
            }
            OutlinedButton(
                onClick = { showDelete = true },
                modifier = Modifier.weight(1f),
                enabled = actionsEnabled
            ) {
                Icon(Icons.Outlined.Delete, contentDescription = null)
                Text("删除", modifier = Modifier.padding(start = 6.dp))
            }
        }
        VideoSection(
            record = record,
            actionsEnabled = actionsEnabled,
            onRecordVideo = {
                val granted = ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) ==
                    PermissionChecker.PERMISSION_GRANTED
                if (granted) onRecordVideo() else cameraPermission.launch(Manifest.permission.CAMERA)
            },
            onPickVideo = { picker.launch("video/*") }
        )
        AnalysisSection(
            record = record,
            actionState = actionState,
            apiMode = apiMode,
            onStart = {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
                } else {
                    onStartAnalysis { error -> message = error }
                }
            },
            onScorePose = { apply ->
                onScorePose(apply) { error -> message = error }
            }
        )
        message?.let { ErrorState(message = it) { message = null } }
        actionState.errorMessage?.let { ErrorState(message = it, onRetry = onClearActionError) }
    }

    if (showDelete) {
        AlertDialog(
            onDismissRequest = { showDelete = false },
            confirmButton = {
                TextButton(onClick = {
                    showDelete = false
                    onDelete()
                }) {
                    Text("删除")
                }
            },
            dismissButton = {
                TextButton(onClick = { showDelete = false }) {
                    Text("取消")
                }
            },
            title = { Text("删除记录") },
            text = { Text("删除后本地 MVP 记录将不再显示。") }
        )
    }
}

@Composable
private fun VideoSection(
    record: TrainingRecord,
    actionsEnabled: Boolean,
    onRecordVideo: () -> Unit,
    onPickVideo: () -> Unit
) {
    LineCard(modifier = Modifier.fillMaxWidth()) {
        Text("训练视频", style = MaterialTheme.typography.titleMedium)
        if (record.videoUri == null) {
            Text("未添加视频", color = MaterialTheme.colorScheme.onSurfaceVariant)
        } else {
            VideoPlayer(uri = record.videoUri, modifier = Modifier.fillMaxWidth())
        }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            OutlinedButton(
                onClick = onRecordVideo,
                modifier = Modifier.weight(1f),
                enabled = actionsEnabled
            ) {
                Icon(Icons.Outlined.Videocam, contentDescription = null)
                Text("拍摄", modifier = Modifier.padding(start = 6.dp))
            }
            OutlinedButton(
                onClick = onPickVideo,
                modifier = Modifier.weight(1f),
                enabled = actionsEnabled
            ) {
                Icon(Icons.Outlined.PhotoLibrary, contentDescription = null)
                Text("选择", modifier = Modifier.padding(start = 6.dp))
            }
        }
    }
}

@Composable
private fun AnalysisSection(
    record: TrainingRecord,
    actionState: RecordActionState,
    apiMode: Boolean,
    onStart: () -> Unit,
    onScorePose: (Boolean) -> Unit
) {
    val result = record.analysisResult
    LineCard(modifier = Modifier.fillMaxWidth()) {
        Text("模拟分析", style = MaterialTheme.typography.titleMedium)
        if (actionState.analyzing) {
            LoadingState("正在分析")
        }
        if (actionState.scoring) {
            LoadingState("正在评分")
        }
        when (result.status) {
            AnalysisStatus.Idle -> Text(
                if (record.videoUri == null) "视频添加后可开始分析" else "等待开始",
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            AnalysisStatus.Queued -> Text("排队中", color = MaterialTheme.colorScheme.onSurfaceVariant)
            AnalysisStatus.Running -> Text("分析中", color = MaterialTheme.colorScheme.onSurfaceVariant)
            AnalysisStatus.Completed -> {
                Text(result.message ?: "完成")
                Text("模型 ${result.modelName}", color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text("有效帧 ${result.validFrameCount}", color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text("平均置信度 ${result.averageConfidence}", color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text("预览分数 ${result.scorePreview}", color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text("预览次数 ${result.countPreview ?: "-"}", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            AnalysisStatus.Failed -> Text(result.message ?: "分析失败", color = MaterialTheme.colorScheme.error)
        }
        Button(
            onClick = onStart,
            enabled = record.videoUri != null && !record.hasActiveAnalysis && !actionState.isBusy,
            modifier = Modifier.fillMaxWidth()
        ) {
            Icon(Icons.Outlined.PlayCircle, contentDescription = null)
            Text("开始分析", modifier = Modifier.padding(start = 8.dp))
        }
        if (apiMode && result.status == AnalysisStatus.Completed) {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedButton(
                    onClick = { onScorePose(false) },
                    enabled = !actionState.isBusy,
                    modifier = Modifier.weight(1f)
                ) {
                    Text("评分预览")
                }
                Button(
                    onClick = { onScorePose(true) },
                    enabled = !actionState.isBusy,
                    modifier = Modifier.weight(1f)
                ) {
                    Text("应用评分")
                }
            }
        }
    }
}
