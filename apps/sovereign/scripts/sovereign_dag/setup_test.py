import os
import psycopg2
import json
from dotenv import load_dotenv

DOTENV_PATH = os.path.join(os.path.dirname(__file__), "..", "..", ".env")
load_dotenv(DOTENV_PATH)

DATABASE_URL = os.environ.get("DATABASE_URL")
# Remove schema param if exists for psycopg2 compatibility
if DATABASE_URL and "schema=" in DATABASE_URL:
    DATABASE_URL = DATABASE_URL.split("?")[0]

def setup_test():
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()
    
    # 1. Ensure the Agent exists
    cur.execute("SELECT id FROM \"Agent\" WHERE key = 'SOVEREIGN_DAG';")
    agent = cur.fetchone()
    if not agent:
        print("Creating SOVEREIGN_DAG Agent...")
        cur.execute("""
            INSERT INTO "Agent" (id, key, "displayName", readiness, "controlRole", enabled, "updatedAt")
            VALUES ('sovereign-dag-id', 'SOVEREIGN_DAG', 'Sovereign DAG Engine', 'READY', 'ALPHA', True, NOW());
        """)
    
    # 2. Create a test task
    payload = {
        "workflow_id": "test-nexus-workflow",
        "task_profile": {
            "intent_raw": "Draft a short welcome message for the new Sovereign team.",
            "task_type": "internal_summary",
            "risk_tier": "R1"
        },
        "execution_state": {
            "current_node": "intent_router",
            "retry_count": 0,
            "status": "in_progress"
        }
    }
    
    print("Cleaning up old test task...")
    cur.execute("DELETE FROM \"AgentTask\" WHERE id = 'test-task-id';")
    
    print("Creating test AgentTask...")
    cur.execute("""
        INSERT INTO "AgentTask" (id, status, "agentKey", title, payload, "updatedAt")
        VALUES ('test-task-id', 'QUEUED', 'SOVEREIGN_DAG', 'Test Nexus Task', %s, NOW())
        RETURNING id;
    """, (json.dumps(payload),))
    
    task_id = cur.fetchone()[0]
    conn.commit()
    print(f"Test task created: {task_id}")
    
    cur.close()
    conn.close()

if __name__ == "__main__":
    setup_test()
