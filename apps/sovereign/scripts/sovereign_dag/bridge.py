import os
import time
import json
import logging
import psycopg2
from datetime import datetime, timezone
from dotenv import load_dotenv

from models import SovereignStatePayload, WorkflowStatus
from orchestrator import execute_dag

# Setup logging
logging.basicConfig(
    level=logging.INFO, 
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("bridge.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("NexusBridge")

# Load environment variables
DOTENV_PATH = os.path.join(os.path.dirname(__file__), "..", "..", ".env")
load_dotenv(DOTENV_PATH)

DATABASE_URL = os.environ.get("DATABASE_URL")
# Remove schema param if exists for psycopg2 compatibility
if DATABASE_URL and "schema=" in DATABASE_URL:
    DATABASE_URL = DATABASE_URL.split("?")[0]

AGENT_KEY = "SOVEREIGN_DAG"
POLL_INTERVAL = 3  # Seconds

def poll_and_execute():
    """Main loop to poll for AgentTask and execute the DAG."""
    logger.info(f"Starting Nexus Bridge for agent '{AGENT_KEY}'...")
    
    while True:
        try:
            conn = psycopg2.connect(DATABASE_URL)
            cur = conn.cursor()
            
            # Find a Sovereign task ready for processing. 
            # We use 'MANUAL_REQUIRED' as the ingestion status to isolate from legacy workers.
            cur.execute("""
                SELECT id, payload, "attemptCount"
                FROM "AgentTask"
                WHERE "agentKey" = %s AND (status = 'MANUAL_REQUIRED' OR status = 'QUEUED')
                ORDER BY "createdAt" ASC
                LIMIT 1
                FOR UPDATE SKIP LOCKED;
            """, (AGENT_KEY,))
            
            row = cur.fetchone()
            
            if row:
                task_id, raw_payload, attempt_count = row
                logger.info(f"Picked up task {task_id}")
                
                # 1. Update status to RUNNING
                cur.execute("""
                    UPDATE "AgentTask"
                    SET status = 'RUNNING', "startedAt" = %s, "attemptCount" = %s
                    WHERE id = %s;
                """, (datetime.now(timezone.utc), attempt_count + 1, task_id))
                conn.commit()
                
                try:
                    # 2. Map payload to Pydantic model
                    # If raw_payload is a string (JSONB in SQL but sometimes arrives as str), parse it
                    if isinstance(raw_payload, str):
                        payload_dict = json.loads(raw_payload)
                    else:
                        payload_dict = raw_payload
                    
                    # Robust Initialization: Handle raw enqueued tasks from Next.js
                    if "task_profile" not in payload_dict:
                        logger.info(f"Initializing fresh payload for task {task_id}")
                        intent = payload_dict.get("intent_raw") or payload_dict.get("intent") or "New Task"
                        payload_dict = {
                            "task_profile": {
                                "intent_raw": intent,
                                "task_type": "internal_summary",
                                "risk_tier": "R1"
                            },
                            "execution_state": {
                                "status": "in_progress",
                                "retry_count": 0,
                                "current_node": "intent_router"
                            },
                            "draft_payload": {"content": "", "feedback_history": []},
                            "node_results": {}
                        }

                    payload = SovereignStatePayload(**payload_dict)
                    
                    # 3. Execute DAG
                    final_payload = execute_dag(payload)
                    
                    # 4. Map back to JSON and finish task
                    status_map = {
                        WorkflowStatus.COMPLETED: "DONE",
                        WorkflowStatus.FAILED: "FAILED",
                        WorkflowStatus.AWAITING_HUMAN: "DONE" # Or keep logic to handle pauses?
                    }
                    
                    # In Sovereign, AWAITING_HUMAN is a specific terminal state for the worker
                    # but might be represented differently in AgentTask.
                    # For now, let's map it to DONE if it finished successfully (even if paused).
                    # If it's AWAITING_HUMAN, it means Node 5 halted it.
                    
                    final_status = status_map.get(final_payload.execution_state.status, "DONE")
                    
                    cur.execute("""
                        UPDATE "AgentTask"
                        SET status = %s, "finishedAt" = %s, "payload" = %s
                        WHERE id = %s;
                    """, (
                        final_status, 
                        datetime.now(timezone.utc), 
                        final_payload.model_dump_json(), 
                        task_id
                    ))
                    conn.commit()
                    logger.info(f"Finished task {task_id} with status {final_status}")
                    
                except Exception as e:
                    logger.error(f"Execution failed for task {task_id}: {str(e)}")
                    cur.execute("""
                        UPDATE "AgentTask"
                        SET status = 'FAILED', error = %s, "finishedAt" = %s
                        WHERE id = %s;
                    """, (str(e), datetime.now(timezone.utc), task_id))
                    conn.commit()
            
            cur.close()
            conn.close()
            
        except Exception as e:
            logger.error(f"Polling error: {str(e)}")
            time.sleep(POLL_INTERVAL)
            continue
            
        time.sleep(POLL_INTERVAL)

if __name__ == "__main__":
    poll_and_execute()
