from __future__ import annotations
from enum import Enum
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field, validator
import uuid

class TaskType(str, Enum):
    INTERNAL_SUMMARY = "internal_summary"
    EXTERNAL_COMMUNICATION = "external_communication"
    DECISION_SUPPORT = "decision_support"
    TECHNICAL_ARTIFACT = "technical_artifact"

class RiskTier(str, Enum):
    R1 = "R1"
    R2 = "R2"
    R3 = "R3"
    R4 = "R4"

class WorkflowStatus(str, Enum):
    IN_PROGRESS = "in_progress"
    AWAITING_HUMAN = "awaiting_human"
    COMPLETED = "completed"
    FAILED = "failed"

class TaskProfile(BaseModel):
    intent_raw: str
    task_type: TaskType
    risk_tier: RiskTier

class ExecutionState(BaseModel):
    current_node: str
    retry_count: int = Field(default=0, ge=0, le=3)
    status: WorkflowStatus
    callback_token: Optional[str] = None
    human_approved: bool = False

class DraftPayload(BaseModel):
    content: Optional[str] = None
    feedback_history: List[str] = Field(default_factory=list)

class ScoreVector(BaseModel):
    grounding: float = Field(ge=0, le=1)
    completeness: float = Field(ge=0, le=1)
    policy: float = Field(ge=0, le=1)
    weighted_sum: Optional[float] = None

class SovereignStatePayload(BaseModel):
    workflow_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    task_profile: TaskProfile
    execution_state: ExecutionState
    context_array: List[str] = Field(default_factory=list)
    draft_payload: Optional[DraftPayload] = None
    score_vector: Optional[ScoreVector] = None
    node_results: Dict[str, Any] = Field(default_factory=dict)

    class Config:
        use_enum_values = True

SovereignStatePayload.model_rebuild()
