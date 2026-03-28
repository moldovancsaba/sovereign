import logging
from models import SovereignStatePayload, WorkflowStatus
from nodes.intent_router import run_intent_router
from nodes.context_builder import run_context_builder
from nodes.generator import run_generator
from nodes.evaluator import run_evaluator
from nodes.dispatcher import run_dispatcher

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# The DAG Routing Map
NODE_REGISTRY = {
    "intent_router": run_intent_router,
    "context_builder": run_context_builder,
    "generator": run_generator,
    "evaluator": run_evaluator,
    "dispatcher": run_dispatcher
}

# Ensure types are fully resolved for Pydantic V2
SovereignStatePayload.model_rebuild()

def execute_dag(payload: SovereignStatePayload) -> SovereignStatePayload:
    """
    The deterministic loop that drives the Sovereign DAG.
    """
    logger.info(f"Starting DAG execution for workflow: {payload.workflow_id}")

    while payload.execution_state.status == WorkflowStatus.IN_PROGRESS:
        current_node_name = payload.execution_state.current_node
        
        logger.info(f"Executing Node: {current_node_name}")
        
        if current_node_name not in NODE_REGISTRY:
            payload.execution_state.status = WorkflowStatus.FAILED
            logger.error(f"Unknown node: {current_node_name}. Halting.")
            break

        # Fetch the node function
        node_function = NODE_REGISTRY[current_node_name]
        
        try:
            # Execute the node. Nodes MUST return the mutated payload.
            payload = node_function(payload)
        except Exception as e:
            # Infrastructure failure catch (Network timeout, DB down, etc.)
            logger.error(f"Infrastructure failure in {current_node_name}: {str(e)}")
            payload.execution_state.status = WorkflowStatus.FAILED
            # In a production environment, we would trigger exponential backoff here
            break

        # Validate the payload hasn't been corrupted by the node
        try:
            payload = SovereignStatePayload.model_validate(payload.model_dump())
        except Exception as e:
            logger.error(f"Payload validation failed after {current_node_name}: {str(e)}")
            payload.execution_state.status = WorkflowStatus.FAILED
            break

    logger.info(f"DAG Execution Halted. Final Status: {payload.execution_state.status.value}")
    return payload
