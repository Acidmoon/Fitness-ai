package com.fitnessai.android.data.repository

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.fitnessai.android.R
import com.fitnessai.android.data.model.TrainingRecord

internal fun TrainingRecordRepository.replaceRecord(record: TrainingRecord) {
    kotlinx.coroutines.runBlocking { updateRecord(record) }
}

class AndroidNotificationScheduler(val application: Application) : NotificationScheduler {
    private val channelId = "analysis-complete"

    init {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                channelId,
                "训练分析",
                NotificationManager.IMPORTANCE_DEFAULT
            )
            application
                .getSystemService(NotificationManager::class.java)
                .createNotificationChannel(channel)
        }
    }

    override fun notifyAnalysisComplete(record: TrainingRecord) {
        val notification = NotificationCompat.Builder(application, channelId)
            .setSmallIcon(R.drawable.ic_stat_analysis)
            .setColor(application.getColor(R.color.notification_accent))
            .setContentTitle("分析完成")
            .setContentText("${record.exerciseName} 的分析结果已生成")
            .setAutoCancel(true)
            .build()

        runCatching {
            NotificationManagerCompat.from(application)
                .notify(record.id.hashCode(), notification)
        }
    }
}
