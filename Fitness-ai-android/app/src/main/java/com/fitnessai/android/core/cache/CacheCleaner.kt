package com.fitnessai.android.core.cache

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File

/**
 * Best-effort clears app-managed caches. Used by Settings to free local space without
 * touching DataStore-backed preferences (theme mode, BaseUrl, auth token).
 */
fun interface CacheCleaner {
    suspend fun clear(): Result<Unit>
}

class FileCacheCleaner(private val context: Context) : CacheCleaner {
    override suspend fun clear(): Result<Unit> = withContext(Dispatchers.IO) {
        runCatching {
            context.cacheDir.deleteRecursivelyIgnoringErrors()
            context.externalCacheDir?.deleteRecursivelyIgnoringErrors()
            Unit
        }
    }

    private fun File.deleteRecursivelyIgnoringErrors() {
        if (!exists()) return
        listFiles()?.forEach { child ->
            if (child.isDirectory) child.deleteRecursivelyIgnoringErrors() else child.delete()
        }
    }
}
