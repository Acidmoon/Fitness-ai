package com.fitnessai.android.ui.training

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun RecordFilterBar(
    state: FilterState,
    categories: List<String>,
    onStateChange: (FilterState) -> Unit,
    modifier: Modifier = Modifier
) {
    Column(modifier = modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        OutlinedTextField(
            value = state.query,
            onValueChange = { onStateChange(state.copy(query = it)) },
            label = { Text("搜索训练项目") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth()
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
            FilterMenu(
                label = state.category,
                options = listOf(ALL_CATEGORIES) + categories.distinct().sorted(),
                onSelected = { onStateChange(state.copy(category = it)) },
                modifier = Modifier.weight(1f)
            )
            FilterMenu(
                label = state.sort.label,
                options = SortOrder.entries.map { it.label },
                onSelected = { label ->
                    onStateChange(state.copy(sort = SortOrder.entries.first { it.label == label }))
                },
                modifier = Modifier.weight(1f)
            )
        }
    }
}

@Composable
private fun FilterMenu(
    label: String,
    options: List<String>,
    onSelected: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    var expanded by remember { mutableStateOf(false) }
    OutlinedButton(onClick = { expanded = true }, modifier = modifier) {
        Text(label)
    }
    DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
        options.forEach { option ->
            DropdownMenuItem(
                text = { Text(option) },
                onClick = {
                    expanded = false
                    onSelected(option)
                }
            )
        }
    }
}
