package com.fitnessai.android.ui.components

import com.fitnessai.android.data.model.AnalysisResult
import com.fitnessai.android.data.model.AnalysisStatus
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class AnalysisDisplayMapperTest {
    @Test
    fun scoreGradeBoundariesAreStable() {
        assertEquals(ScoreGrade.Excellent, ScoreGrade.of(90))
        assertEquals(ScoreGrade.Good, ScoreGrade.of(75))
        assertEquals(ScoreGrade.Pass, ScoreGrade.of(60))
        assertEquals(ScoreGrade.NeedsWork, ScoreGrade.of(59))
    }

    @Test
    fun zeroValidFramesShowsGuidanceAndHidesBars() {
        val display = AnalysisDisplayMapper.map(
            AnalysisResult(
                status = AnalysisStatus.Completed,
                validFrameCount = 0,
                averageConfidence = 0.8,
                scorePreview = 80
            ),
            totalFrames = 100
        )

        assertNull(display.averageConfidence)
        assertNull(display.validFrameRatio)
        assertEquals("未检测到有效姿态帧，请重新拍摄", display.errorMessage)
    }
}
