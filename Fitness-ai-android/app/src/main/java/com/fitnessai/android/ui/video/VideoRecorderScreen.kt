package com.fitnessai.android.ui.video

import android.content.ContentValues
import android.net.Uri
import android.provider.MediaStore
import androidx.camera.view.CameraController
import androidx.camera.view.LifecycleCameraController
import androidx.camera.view.PreviewView
import androidx.camera.video.MediaStoreOutputOptions
import androidx.camera.video.Quality
import androidx.camera.video.QualitySelector
import androidx.camera.video.Recording
import androidx.camera.video.VideoRecordEvent
import androidx.camera.view.video.AudioConfig
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Stop
import androidx.compose.material.icons.outlined.Videocam
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import com.fitnessai.android.ui.components.ErrorState

@Composable
fun VideoRecorderScreen(
    onVideoSaved: (Uri) -> Unit,
    onClose: () -> Unit
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    var recording by remember { mutableStateOf<Recording?>(null) }
    var message by remember { mutableStateOf<String?>(null) }
    val controller = remember {
        LifecycleCameraController(context).apply {
            setEnabledUseCases(CameraController.VIDEO_CAPTURE)
            videoCaptureQualitySelector = QualitySelector.from(Quality.HD)
        }
    }

    DisposableEffect(lifecycleOwner) {
        controller.bindToLifecycle(lifecycleOwner)
        onDispose {
            recording?.close()
            controller.unbind()
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Row {
            IconButton(onClick = onClose) {
                Icon(Icons.Outlined.ArrowBack, contentDescription = "返回")
            }
            Text("拍摄视频", style = MaterialTheme.typography.displaySmall)
        }
        AndroidView(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f),
            factory = {
                PreviewView(it).apply {
                    this.controller = controller
                    scaleType = PreviewView.ScaleType.FILL_CENTER
                }
            }
        )
        message?.let { ErrorState(message = it) { message = null } }
        Button(
            modifier = Modifier.fillMaxWidth(),
            onClick = {
                val active = recording
                if (active != null) {
                    active.stop()
                    recording = null
                } else {
                    val values = ContentValues().apply {
                        put(MediaStore.Video.Media.DISPLAY_NAME, "fitness-ai-${System.currentTimeMillis()}")
                        put(MediaStore.Video.Media.MIME_TYPE, "video/mp4")
                        put(MediaStore.Video.Media.RELATIVE_PATH, "Movies/FitnessAI")
                    }
                    val outputOptions = MediaStoreOutputOptions.Builder(
                        context.contentResolver,
                        MediaStore.Video.Media.EXTERNAL_CONTENT_URI
                    ).setContentValues(values).build()

                    recording = controller.startRecording(
                        outputOptions,
                        AudioConfig.create(false),
                        ContextCompat.getMainExecutor(context)
                    ) { event: VideoRecordEvent ->
                        when (event) {
                            is VideoRecordEvent.Finalize -> {
                                recording = null
                                if (event.hasError()) {
                                    message = "视频保存失败"
                                } else {
                                    onVideoSaved(event.outputResults.outputUri)
                                }
                            }
                        }
                    }
                }
            }
        ) {
            if (recording == null) {
                Icon(Icons.Outlined.Videocam, contentDescription = null)
                Text("开始拍摄", modifier = Modifier.padding(start = 8.dp))
            } else {
                Icon(Icons.Outlined.Stop, contentDescription = null)
                Text("停止并保存", modifier = Modifier.padding(start = 8.dp))
            }
        }
    }
}
