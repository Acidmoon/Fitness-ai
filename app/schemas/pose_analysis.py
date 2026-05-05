from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class PoseAnalysisTriggerRequest(BaseModel):
    sample_fps: Optional[int] = Field(None, ge=1, le=30)


class PoseAnalysisModelMetadata(BaseModel):
    name: Optional[str] = None
    input_size: Optional[int] = None


class PoseAnalysisSummary(BaseModel):
    total_frames: int = 0
    processed_frames: int = 0
    sampled_frames: int = 0
    valid_frame_count: int = 0
    average_confidence: float = 0
    source_fps: Optional[float] = None
    sample_fps: int


class PoseAnalysisFrame(BaseModel):
    frame_index: int
    timestamp_ms: int
    keypoints: List[Dict[str, Any]]


class PoseAnalysisResponse(BaseModel):
    record_id: int
    schema_version: int = 1
    status: Literal["idle", "done", "failed"]
    model: Optional[PoseAnalysisModelMetadata] = None
    summary: Optional[PoseAnalysisSummary] = None
    frames: List[PoseAnalysisFrame] = []
    error: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


PoseAnalysisJobStatus = Literal["queued", "running", "succeeded", "failed"]


class PoseAnalysisJobResponse(BaseModel):
    id: int
    record_id: int
    status: PoseAnalysisJobStatus
    error: Optional[str] = None
    result_summary: Optional[Dict[str, Any]] = None
    created_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
