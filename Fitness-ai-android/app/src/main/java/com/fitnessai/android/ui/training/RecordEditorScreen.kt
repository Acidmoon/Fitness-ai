package com.fitnessai.android.ui.training

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Save
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.fitnessai.android.data.model.RecordDraft
import com.fitnessai.android.data.model.TrainingRecord
import com.fitnessai.android.ui.components.ErrorState

@Composable
fun RecordEditorScreen(
    title: String,
    initial: TrainingRecord?,
    onBack: () -> Unit,
    onSave: (RecordDraft) -> Boolean
) {
    var draft by remember(initial?.id) {
        mutableStateOf(
            RecordDraft(
                exerciseName = initial?.exerciseName.orEmpty(),
                category = initial?.category.orEmpty(),
                count = initial?.count?.toString().orEmpty(),
                score = initial?.score?.toString().orEmpty(),
                durationSeconds = initial?.durationSeconds?.toString().orEmpty()
            )
        )
    }
    var error by remember { mutableStateOf<String?>(null) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Row {
            IconButton(onClick = onBack) {
                Icon(Icons.Outlined.ArrowBack, contentDescription = "返回")
            }
            Text(title, style = MaterialTheme.typography.displaySmall)
        }
        OutlinedTextField(
            value = draft.exerciseName,
            onValueChange = { draft = draft.copy(exerciseName = it) },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("动作名称") },
            singleLine = true
        )
        OutlinedTextField(
            value = draft.category,
            onValueChange = { draft = draft.copy(category = it) },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("分类") },
            singleLine = true
        )
        OutlinedTextField(
            value = draft.count,
            onValueChange = { draft = draft.copy(count = it) },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("次数") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number)
        )
        OutlinedTextField(
            value = draft.score,
            onValueChange = { draft = draft.copy(score = it) },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("分数") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number)
        )
        OutlinedTextField(
            value = draft.durationSeconds,
            onValueChange = { draft = draft.copy(durationSeconds = it) },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("时长（秒）") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number)
        )
        error?.let { ErrorState(message = it) }
        Button(
            modifier = Modifier.fillMaxWidth(),
            onClick = {
                val saved = onSave(draft)
                error = if (saved) null else "请填写动作名称、分类和有效次数"
            }
        ) {
            Icon(Icons.Outlined.Save, contentDescription = null)
            Text("保存", modifier = Modifier.padding(start = 8.dp))
        }
        OutlinedButton(onClick = onBack, modifier = Modifier.fillMaxWidth()) {
            Text("取消")
        }
    }
}
