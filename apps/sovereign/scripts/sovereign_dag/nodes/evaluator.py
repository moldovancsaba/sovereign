import os
import logging
from datetime import datetime
from pydantic import BaseModel, Field
from openai import OpenAI
import instructor
from models import SovereignStatePayload, ScoreVector, WorkflowStatus
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

# Load environment variables
DOTENV_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "..", ".env")
load_dotenv(DOTENV_PATH)

from providers import get_instructor_llm_client

# Initialize Instructor via Compute Matrix
client, MODEL_NAME = get_instructor_llm_client()

# --- DETERMINISTIC EVALUATION CONFIG ---
CATASTROPHIC_FLOOR = 0.40
PASS_THRESHOLD = 0.75
WEIGHTS = {
    "grounding": 0.40,
    "completeness": 0.30,
    "policy": 0.30
}

class LLMDimensions(BaseModel):
    """Structured scoring by LLM-as-a-judge."""
    grounding: float = Field(ge=0.0, le=1.0, description="Factual support based on context.")
    completeness: float = Field(ge=0.0, le=1.0, description="Covers required parts of the intent.")
    policy: float = Field(ge=0.0, le=1.0, description="Safety, alignment, and constitutional adherence.")
    critique: str = Field(description="Constructive criticism for areas of improvement.")

def run_evaluator(payload: SovereignStatePayload) -> SovereignStatePayload:
    """
    Node 4: The Deterministic Bouncer (LLM-as-a-Judge).
    """
    logger.info("Calling LLM for Artifact Evaluation...")
    
    try:
        # Call LLM-as-a-judge
        eval_response = client.chat.completions.create(
            model=MODEL_NAME,
            response_model=LLMDimensions,
            messages=[
                {"role": "system", "content": "You are a harsh but fair judge for the Sovereign platform. You MUST return ONLY a valid JSON object. Do not include any preamble or markdown formatting other than the JSON itself."},
                {"role": "user", "content": f"INTENT: {payload.task_profile.intent_raw}\nARTIFACT:\n{payload.draft_payload.content}"}
            ]
        )
        
        llm_scores = {
            "grounding": eval_response.grounding,
            "completeness": eval_response.completeness,
            "policy": eval_response.policy
        }
        
        logger.info(f"LLM Scores - Grounding: {llm_scores['grounding']}, Completeness: {llm_scores['completeness']}, Policy: {llm_scores['policy']}")

        # 1. Catastrophic Floor Check (Fail Fast)
        for dim, score in llm_scores.items():
            if score < CATASTROPHIC_FLOOR:
                logger.warning(f"Catastrophic failure in {dim}: {score} < {CATASTROPHIC_FLOOR}")
                return _trigger_retry(payload, f"Catastrophic failure in {dim} ({score}): {eval_response.critique}")

        # 2. Thresholded Weighted Sum
        weighted_sum = sum(llm_scores[dim] * WEIGHTS.get(dim, 0) for dim in llm_scores)
        
        # Record scores
        payload.score_vector = ScoreVector(
            grounding=llm_scores["grounding"],
            completeness=llm_scores["completeness"],
            policy=llm_scores["policy"],
            weighted_sum=round(weighted_sum, 3)
        )

        # 3. Final Decision Logic
        if weighted_sum >= PASS_THRESHOLD:
            logger.info(f"Artifact passed evaluation. Score: {weighted_sum:.3f}")
            payload.execution_state.current_node = "dispatcher"
        else:
            logger.info(f"Artifact failed evaluation. Score: {weighted_sum:.3f} < {PASS_THRESHOLD}")
            payload = _trigger_retry(payload, f"Weighted sum {weighted_sum:.3f} failed threshold. Improvement needed: {eval_response.critique}")

    except Exception as e:
        logger.error(f"LLM Evaluation Failure: {str(e)}")
        # Failure in evaluator triggers a retry with a generic error
        payload = _trigger_retry(payload, f"Evaluation API failed: {str(e)}")
    
    # Save results to audit log
    if "evaluator" not in payload.node_results:
        payload.node_results["evaluator"] = []
        
    payload.node_results["evaluator"].append({
        "score_vector": payload.score_vector.model_dump() if payload.score_vector else None,
        "retry_count": payload.execution_state.retry_count,
        "timestamp": datetime.now().isoformat()
    })
    
    return payload


def _trigger_retry(payload: SovereignStatePayload, feedback_msg: str) -> SovereignStatePayload:
    """Helper to handle the retry increment and routing."""
    if payload.execution_state.retry_count >= 3:
        logger.error("Max retries hit (3). Halting DAG.")
        payload.execution_state.status = WorkflowStatus.FAILED
    else:
        payload.execution_state.retry_count += 1
        logger.info(f"Triggering retry {payload.execution_state.retry_count}/3")
        payload.draft_payload.feedback_history.append(feedback_msg)
        payload.execution_state.current_node = "generator"
        
    return payload
