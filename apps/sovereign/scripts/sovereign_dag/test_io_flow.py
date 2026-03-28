import requests
import time
import json
import base64

BASE_URL = "http://localhost:3007/api/sovereign"

def test_full_flow():
    # 1. Ingest
    print("\n--- 1. INGESTING TASK ---")
    intent = "Send a highly confidential business proposal to a new client via WhatsApp." # Should trigger R3/R4
    resp = requests.post(f"{BASE_URL}/ingest", json={"intent": intent})
    if resp.status_code != 202:
        print(f"FAILED Ingestion: {resp.text}")
        return
    
    task_id = resp.json()["taskId"]
    print(f"Task enqueued: {task_id}")

    # 2. Wait for AWAITING_HUMAN
    print("\n--- 2. WAITING FOR HUMAN APPROVAL STEP ---")
    callback_token = None
    for _ in range(30):
        status_resp = requests.get(f"{BASE_URL}/status?taskId={task_id}")
        data = status_resp.json()
        status = data["status"]
        print(f"Current Status: {status}")
        
        if status == "DONE":
            # Check internal payload status
            payload = data.get("payload", {})
            internal_status = payload.get("execution_state", {}).get("status")
            if internal_status == "awaiting_human":
                callback_token = payload["execution_state"]["callback_token"]
                print(f"Hit Trust Boundary! Token: {callback_token}")
                break
        
        if status == "FAILED":
            print(f"Task Failed: {data.get('error') or data.get('payload', {}).get('feedback_history')}")
            return

        time.sleep(5)
    
    if not callback_token:
        print("Timed out waiting for approval step.")
        return

    # 3. Approve
    print("\n--- 3. APPROVING TASK ---")
    approve_resp = requests.post(f"{BASE_URL}/approve", json={
        "taskId": task_id,
        "callbackToken": callback_token,
        "approved": True
    })
    print(f"Approval status: {approve_resp.status_code} - {approve_resp.json().get('message')}")

    # 4. Final Wait
    print("\n--- 4. WAITING FOR FINAL COMPLETION ---")
    for _ in range(20):
        status_resp = requests.get(f"{BASE_URL}/status?taskId={task_id}")
        data = status_resp.json()
        status = data["status"]
        payload = data.get("payload", {})
        internal_status = payload.get("execution_state", {}).get("status")
        
        print(f"Current Status: {status} (Internal: {internal_status})")
        
        if status == "DONE" and internal_status == "completed":
            print("SUCCESS: Task fully completed after approval!")
            return
        
        time.sleep(5)

if __name__ == "__main__":
    test_full_flow()
