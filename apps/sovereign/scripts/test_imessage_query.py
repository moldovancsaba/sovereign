import sqlite3
from pathlib import Path

CHAT_DB = Path.home() / "Library" / "Messages" / "chat.db"

def test_query():
    print(f"Checking access to {CHAT_DB}...")
    try:
        conn = sqlite3.connect(f"file:{CHAT_DB}?mode=ro", uri=True)
        cursor = conn.cursor()
        
        # Just check the tables
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        tables = [row[0] for row in cursor.fetchall()]
        print(f"Tables found: {', '.join(tables[:10])}...")
        
        # Check if handle table has IDs
        cursor.execute("SELECT id FROM handle LIMIT 5;")
        handles = [row[0] for row in cursor.fetchall()]
        print(f"Sample handles: {handles}")
        
        conn.close()
        return True
    except Exception as e:
        print(f"Error: {e}")
        return False

if __name__ == "__main__":
    if test_query():
        print("SUCCESS: Connection to chat.db established.")
    else:
        print("FAILED: Could not access chat.db.")
