package com.fitnessai.android.data.repository

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.fitnessai.android.R
import com.fitnessai.android.data.model.AnalysisResult
import com.fitnessai.android.data.model.AnalysisStatus
import com.fitnessai.android.data.model.StatsSummary
import com.fitnessai.android.data.model.TrainingRecord
import com.fitnessai.android.data.model.UserRole
import com.fitnessai.android.data.model.UserSession
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlin.math.max

class InMemoryAuthRepository : AuthRepository {
    private val _session = MutableStateFlow<UserSession?>(null)
    override val session: StateFlow<UserSession?> = _session

    override suspend fun login(username: String, password: String): Result<Unit> {
        return if (username.isNotBlank() && password.length >= 4) {
            _session.value = UserSession(displayName = username.trim())
            Result.success(Unit)
        } else {
            Result.failure(IllegalArgumentException("请输入用户名和至少 4 位密码"))
        }
    }

    override fun selectRole(role: UserRole) {
        _session.update { current -> current?.copy(role = role) }
    }

    override suspend fun logout() {
        _session.value = null
    }
}

class InMemoryTrainingRecordRepository : TrainingRecordRepository {
    private val _records = MutableStateFlow(
        listOf(
            TrainingRecord(
                exerciseName = "仰卧起坐",
                category = "核心",
                count = 32,
                score = 86,
                durationSeconds = 60
            ),
            TrainingRecord(
                exerciseName = "俯卧撑",
                category = "上肢",
                count = 24,
                score = 82,
                durationSeconds = 75
            )
        )
    )
    override val records: StateFlow<List<TrainingRecord>> = _records

    override suspend fun refresh(): Result<Unit> = Result.success(Unit)

    override fun getRecord(id: String): TrainingRecord? {
        return _records.value.firstOrNull { it.id == id }
    }

    override fun createRecord(record: TrainingRecord) {
        _records.update { records -> listOf(record) + records }
    }

    override fun updateRecord(record: TrainingRecord) {
        _records.update { records -> records.map { if (it.id == record.id) record else it } }
    }

    override fun deleteRecord(id: String) {
        _records.update { records -> records.filterNot { it.id == id } }
    }
}

class LocalStatsRepository(
    private val records: TrainingRecordRepository
) : StatsRepository {
    private val _stats = MutableStateFlow(calculate(records.records.value))
    override val stats: StateFlow<StatsSummary> = _stats

    override suspend fun refresh(): Result<Unit> {
        _stats.value = calculate(records.records.value)
        return Result.success(Unit)
    }

    private fun calculate(records: List<TrainingRecord>): StatsSummary {
        return StatsSummary(
            totalRecords = records.size,
            totalCount = records.sumOf { it.count },
            totalDurationSeconds = records.sumOf { it.durationSeconds ?: 0 },
            bestScore = records.mapNotNull { it.score }.maxOrNull()
        )
    }
}

class LocalVideoRepository(
    private val records: TrainingRecordRepository,
    private val analysis: AnalysisRepository
) : VideoRepository {
    override fun attachVideo(recordId: String, uri: Uri) {
        val record = records.getRecord(recordId) ?: return
        records.updateRecord(record.copy(videoUri = uri))
        analysis.clearAnalysis(recordId)
    }
}

class SimulatedAnalysisRepository(
    private val records: TrainingRecordRepository,
    private val notifications: NotificationScheduler
) : AnalysisRepository {
    override suspend fun startAnalysis(recordId: String): Result<Unit> {
        val record = records.getRecord(recordId) ?: return Result.failure(
            IllegalArgumentException("记录不存在")
        )
        if (record.videoUri == null) {
            return Result.failure(IllegalStateException("请先添加训练视频"))
        }
        if (record.hasActiveAnalysis) {
            return Result.failure(IllegalStateException("分析正在进行中"))
        }

        records.updateRecord(record.copy(analysisResult = AnalysisResult(AnalysisStatus.Queued)))
        delay(700)
        records.getRecord(recordId)?.let {
            records.updateRecord(it.copy(analysisResult = AnalysisResult(AnalysisStatus.Running)))
        }
        delay(1400)

        val latest = records.getRecord(recordId) ?: return Result.failure(
            IllegalArgumentException("记录不存在")
        )
        val score = max(60, 78 + latest.count % 18)
        val completed = latest.copy(
            score = score,
            analysisResult = AnalysisResult(
                status = AnalysisStatus.Completed,
                modelName = "MoveNet MVP Simulation",
                validFrameCount = 120 + latest.count,
                averageConfidence = 0.86,
                scorePreview = score,
                message = "模拟分析已完成"
            )
        )
        records.updateRecord(completed)
        notifications.notifyAnalysisComplete(completed)
        return Result.success(Unit)
    }

    override fun clearAnalysis(recordId: String) {
        val record = records.getRecord(recordId) ?: return
        records.updateRecord(record.copy(analysisResult = AnalysisResult(AnalysisStatus.Idle)))
    }
}

class AndroidNotificationScheduler(private val application: Application) : NotificationScheduler {
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
            .setContentText("${record.exerciseName} 的模拟分析结果已生成")
            .setAutoCancel(true)
            .build()

        runCatching {
            NotificationManagerCompat.from(application)
                .notify(record.id.hashCode(), notification)
        }
    }
}
