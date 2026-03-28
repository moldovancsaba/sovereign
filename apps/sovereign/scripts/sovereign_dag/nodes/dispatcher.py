import logging
from datetime import datetime
import uuid
from models import SovereignStatePayload, WorkflowStatus, RiskTier

logger = logging.getLogger(__name__)

def run_dispatcher(payload: SovereignStatePayload) -> SovereignStatePayload:
    """
    Node 5: The Network Egress and Trust Boundary.
    Enforces the R3/R4 human-in-the-loop pause, or executes R1/R2 tasks.
    """
    risk_tier = payload.task_profile.risk_tier
    logger.info(f"Running Dispatcher. Payload Risk Tier: {risk_tier.value}")

    # ---------------------------------------------------------
    # ROUTING LOGIC BASED ON RISK TIER
    # R1 / R2: Autonomous Execution Allowed
    # R3 / R4: Mandatory Human-in-the-Loop Pause
    # ---------------------------------------------------------

    if risk_tier in [RiskTier.R1, RiskTier.R2] or payload.execution_state.human_approved:
        logger.info(f"[{risk_tier.value}] Execution approved. Dispatching payload...")
        
        # TODO: Connect to actual external APIs (Email, Slack, Code Deployment, etc.)
        
        logger.info("Payload successfully dispatched.")
        
        # Terminal State: Success
        payload.execution_state.status = WorkflowStatus.COMPLETED

    elif risk_tier in [RiskTier.R3, RiskTier.R4]:
        logger.warning(f"[{risk_tier.value}] High-risk consequence detected. Halting for human approval.")
        
        # Generate token if not already present
        if not payload.execution_state.callback_token:
            payload.execution_state.callback_token = str(uuid.uuid4())
            
        logger.info(f"Generated human-review callback token: {payload.execution_state.callback_token}")
        
        # Terminal State for this DAG Run: Paused / Awaiting
        payload.execution_state.status = WorkflowStatus.AWAITING_HUMAN
        
        # Fallback for undefined risk tiers (fail safe)
        logger.error(f"Unknown risk tier: {risk_tier}. Blocking dispatch.")
        payload.execution_state.status = WorkflowStatus.FAILED

    # Save results to audit log
    payload.node_results["dispatcher"] = {
        "final_status": payload.execution_state.status.value,
        "timestamp": datetime.now().isoformat()
    }
    
    return payload
