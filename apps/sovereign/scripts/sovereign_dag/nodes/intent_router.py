import os
import logging
from pydantic import BaseModel, Field
from openai import OpenAI
import instructor
from models import SovereignStatePayload, TaskProfile, TaskType, RiskTier, WorkflowStatus
from datetime import datetime
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

# Load environment variables
DOTENV_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "..", ".env")
load_dotenv(DOTENV_PATH)

from providers import get_instructor_llm_client

# Initialize Instructor via Compute Matrix
client, MODEL_NAME = get_instructor_llm_client()

class IntentClassification(BaseModel):
    """Structured output for intent classification."""
    task_type: TaskType = Field(description="The primary category of the user's intent.")
    risk_tier: RiskTier = Field(description="The risk level associated with the intent.")
    confidence: float = Field(ge=0.0, le=1.0, description="Confidence score for the classification.")
    reasoning: str = Field(description="Short explanation for the assigned type and tier.")

def run_intent_router(payload: SovereignStatePayload) -> SovereignStatePayload:
    """
    Node 1: Parses raw intent, assigns Risk Tier and Task Type using LLM.
    """
    raw_intent = payload.task_profile.intent_raw
    logger.info(f"Classifying intent: '{raw_intent[:50]}...'")

    try:
        # Structured classification call
        classification = client.chat.completions.create(
            model=MODEL_NAME,
            response_model=IntentClassification,
            messages=[
                {"role": "system", "content": "You are a precise classifier for the Sovereign DAG. You MUST return ONLY a valid JSON object. Do not include any preamble or markdown formatting other than the JSON itself."},
                {"role": "user", "content": f"User Intent: {raw_intent}"}
            ]
        )
        
        logger.info(f"Classification Result: {classification.task_type.value} ({classification.risk_tier.value}), Confidence: {classification.confidence}")
        logger.debug(f"Reasoning: {classification.reasoning}")

        if classification.confidence < 0.75:
            logger.warning(f"Low confidence intent parsing ({classification.confidence}). Routing to human fallback.")
            payload.execution_state.status = WorkflowStatus.AWAITING_HUMAN
            return payload

        # Lock in the Profile
        payload.task_profile.task_type = classification.task_type
        payload.task_profile.risk_tier = classification.risk_tier
        
        # Transition to Node 2
        payload.execution_state.current_node = "context_builder"

        # Save results to audit log
        if not payload.node_results:
            payload.node_results = {}
            
        payload.node_results["intent_router"] = {
            "classification": classification.model_dump(),
            "timestamp": datetime.now().isoformat()
        }

    except Exception as e:
        logger.error(f"Intent classification failure: {str(e)}")
        # In case of failure, we fail the DAG for safety
        payload.execution_state.status = WorkflowStatus.FAILED
    
    return payload
