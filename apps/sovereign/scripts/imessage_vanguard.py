import os
import sqlite3
import time
import json
import logging
import requests
import subprocess
from pathlib import Path
from dotenv import load_dotenv

# Setup Logging
logging.basicConfig(
    level=logging.INFO, 
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(Path(__file__).resolve().parent / "imessage_vanguard.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("iMessageVanguard")

# Paths and Configuration
CHAT_DB = Path.home() / "Library" / "Messages" / "chat.db"
STATE_FILE = Path.home() / ".sovereign_imessage_state.json"
# Load from the parent directory of this script, assuming it's in apps/sovereign/scripts/
DOTENV_PATH = Path(__file__).resolve().parents[1] / ".env"
load_dotenv(DOTENV_PATH)

OWNER_HANDLE = os.environ.get("SOVEREIGN_OWNER_HANDLE", "+1234567890")
API_BASE = os.environ.get("SOVEREIGN_API_BASE", "http://localhost:3007")
POLL_INTERVAL = 5 # seconds

def check_permissions():
    """Verify script has access to chat.db."""
    if not CHAT_DB.exists():
        logger.error(f"Cannot find chat.db at {CHAT_DB}. Ensure iMessage is set up.")
        return False
    try:
        # We use uri=True and mode=ro for readonly access to avoid locking the DB
        conn = sqlite3.connect(f"file:{CHAT_DB}?mode=ro", uri=True)
        conn.execute("SELECT ROWID FROM message LIMIT 1")
        conn.close()
        return True
    except sqlite3.OperationalError as e:
        logger.error(f"Permission Error: Cannot read chat.db. Ensure Terminal has 'Full Disk Access' and 'Automation' permissions. Error: {e}")
        return False
    except Exception as e:
        logger.error(f"Unexpected error checking permissions: {e}")
        return False

def get_last_rowid():
    """Retrieve last processed ROWID from state file."""
    if STATE_FILE.exists():
        try:
            with open(STATE_FILE, "r") as f:
                return json.load(f).get("last_rowid", 0)
        except Exception:
            return 0
    return 0

def save_last_rowid(rowid):
    """Save last processed ROWID to state file."""
    with open(STATE_FILE, "w") as f:
        json.dump({"last_rowid": rowid}, f)

def send_imessage(handle, text):
    """Execute AppleScript to send iMessage."""
    logger.info(f"Sending response to {handle}...")
    # Escape double quotes for AppleScript
    safe_text = text.replace('"', '\\"').replace('\n', '\\r')
    # Use a more robust participant search script
    script = f'''
    tell application "Messages"
        set targetBuddy to buddy "{handle}" of (service 1 whose service type is iMessage)
        send "{safe_text}" to targetBuddy
    end tell
    '''
    try:
        subprocess.run(["osascript", "-e", script], check=True, capture_output=True)
        return True
    except subprocess.CalledProcessError as e:
        error_msg = e.stderr.decode().strip()
        logger.error(f"AppleScript Error: {error_msg}")
        return False

def poll_and_ingest():
    """Main loop to watch for new messages and trigger DAG."""
    last_rowid = get_last_rowid()
    logger.info(f"Vanguard Startup. Watching for messages from '{OWNER_HANDLE}' (Last ROWID: {last_rowid})")
    
    if last_rowid == 0:
        # Initialize with current max ROWID to avoid processing history on first run
        try:
            conn = sqlite3.connect(f"file:{CHAT_DB}?mode=ro", uri=True)
            cursor = conn.cursor()
            cursor.execute("SELECT MAX(ROWID) FROM message")
            max_id = cursor.fetchone()[0] or 0
            save_last_rowid(max_id)
            last_rowid = max_id
            logger.info(f"Initialized state with current max ROWID: {max_id}")
            conn.close()
        except Exception as e:
            logger.error(f"Failed to initialize state: {e}")

    active_tasks = {} # taskId -> handle

    while True:
        try:
            # 1. Check for new messages
            conn = sqlite3.connect(f"file:{CHAT_DB}?mode=ro", uri=True)
            cursor = conn.cursor()
            
            # Query for new messages from handles that match our owner handle
            # handles starting with or equal to the owner handle
            query = """
            SELECT m.ROWID, m.text, h.id
            FROM message m
            JOIN handle h ON m.handle_id = h.ROWID
            WHERE (h.id = ? OR h.id LIKE ?) AND m.is_from_me = 0 AND m.ROWID > ?
            ORDER BY m.ROWID ASC
            """
            cursor.execute(query, (OWNER_HANDLE, f"%{OWNER_HANDLE}", last_rowid))
            rows = cursor.fetchall()
            
            for rowid, text, handle in rows:
                if text:
                    logger.info(f"New intent detected from {handle} (ID: {rowid}): {text[:50]}...")
                    # Ingest to API
                    try:
                        resp = requests.post(f"{API_BASE}/api/sovereign/ingest", json={
                            "intent": text,
                            "channel": "imessage",
                            "metadata": {"imessage_rowid": rowid}
                        }, timeout=10)
                        resp.raise_for_status()
                        data = resp.json()
                        task_id = data.get("taskId")
                        if task_id:
                            logger.info(f"Task enqueued. TaskID: {task_id}")
                            active_tasks[task_id] = handle
                    except Exception as e:
                        logger.error(f"Ingestion failed for message {rowid}: {e}")
                
                last_rowid = rowid
                save_last_rowid(last_rowid)

            conn.close()

            # 2. Check status of active tasks
            completed_tasks = []
            for task_id, handle in active_tasks.items():
                try:
                    resp = requests.get(f"{API_BASE}/api/sovereign/status", params={"taskId": task_id}, timeout=10)
                    resp.raise_for_status()
                    task_data = resp.json()
                    status = task_data.get("status")
                    
                    if status == "DONE":
                        logger.info(f"Task {task_id} COMPLETED. Sending response back to phone.")
                        payload = task_data.get("payload", {})
                        # Handle both JSON string and Dict payload
                        if isinstance(payload, str):
                            try:
                                payload = json.loads(payload)
                            except:
                                payload = {}
                        
                        content = payload.get("draft_payload", {}).get("content", "No content generated.")
                        if send_imessage(handle, content):
                            completed_tasks.append(task_id)
                    elif status == "FAILED":
                        logger.error(f"Task {task_id} FAILED in DAG. Notifying owner.")
                        error_detail = task_data.get("error", "Unknown error")
                        send_imessage(handle, f"⚠️ Sovereign DAG Error: Task failed. Detail: {error_detail}")
                        completed_tasks.append(task_id)
                except Exception as e:
                    logger.debug(f"Waiting for task {task_id}... ({e})")

            for t_id in completed_tasks:
                del active_tasks[t_id]

        except Exception as e:
            logger.error(f"Vanguard Loop Error: {e}")
        
        time.sleep(POLL_INTERVAL)

if __name__ == "__main__":
    if check_permissions():
        poll_and_ingest()
    else:
        logger.error("Vanguard cannot start due to missing permissions or database error.")
        print("\n--- ACTION REQUIRED ---")
        print("1. Go to System Settings -> Privacy & Security -> Full Disk Access.")
        print("2. Ensure your Terminal or IDE (e.g., VS Code) is enabled.")
        print("3. Ensure 'Automation' permissions are granted for Messages app control.")
