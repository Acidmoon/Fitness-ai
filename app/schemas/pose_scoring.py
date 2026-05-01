from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class PoseScoringRequest(BaseModel):
    apply: bool = False


class PoseScoringResponse(BaseModel):
    record_id: int
    status: Literal["scored", "unsupported"]
    applied: bool = False
    exercise_type: Optional[str] = None
    score: Optional[float] = None
    count: Optional[int] = None
    confidence: Optional[float] = None
    feedback: List[str] = Field(default_factory=list)
    metrics: Dict[str, Any] = Field(default_factory=dict)

    model_config = ConfigDict(from_attributes=True)
