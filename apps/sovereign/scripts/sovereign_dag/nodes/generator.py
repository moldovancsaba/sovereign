import os
import logging
from datetime import datetime
from openai import OpenAI
from models import SovereignStatePayload, DraftPayload
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

# Load environment variables
DOTENV_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "..", ".env")
load_dotenv(DOTENV_PATH)

from providers import get_llm_client

# Initialize Client via Compute Matrix
client, MODEL_NAME = get_llm_client()

def run_generator(payload: SovereignStatePayload) -> SovereignStatePayload:
    """
    Node 3: The Heavy Lifter.
    Generates the artifact using Ollama.
    """
    logger.info(f"Running Generator for Task: {payload.task_profile.task_type.value}")

    # Ensure draft_payload exists
    if payload.draft_payload is None:
        payload.draft_payload = DraftPayload()

    # Build prompt
    context_text = "\n".join([f"- {c}" for c in payload.context_array]) or "No relevant context found."
    feedback_text = "\n".join([f"- {f}" for f in payload.draft_payload.feedback_history]) or "No previous feedback."

    system_prompt = (
        "You are the Sovereign Generator. Your goal is to produce high-quality artifacts based on user intent and provided context. "
        "If feedback is provided, you MUST address it in your next attempt. "
        "Be concise, professional, and factually grounded."
    )
    
    user_prompt = f"""
USER INTENT: {payload.task_profile.intent_raw}
TASK TYPE: {payload.task_profile.task_type.value}
RISK TIER: {payload.task_profile.risk_tier.value}

RELEVANT CONTEXT:
{context_text}

PREVIOUS FEEDBACK TO ADDRESS:
{feedback_text}

GENERATE THE ARTIFACT:
"""

    try:
        response = client.chat.completions.create(
            model=MODEL_NAME,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.7
        )
        
        generated_text = response.choices[0].message.content
        logger.info("Generation complete.")

        # Update payload
        payload.draft_payload.content = generated_text
        
        # Transition to Evaluator
        payload.execution_state.current_node = "evaluator"
        
        # Save results to audit log
        payload.node_results["generator"] = {
            "content_length": len(payload.draft_payload.content) if payload.draft_payload.content else 0,
            "timestamp": datetime.now().isoformat()
        }

    except Exception as e:
        logger.error(f"Generation failure: {str(e)}")
        # Failure in generation defaults to DAG failure
        payload.execution_state.status = WorkflowStatus.FAILED
    
    return payload
