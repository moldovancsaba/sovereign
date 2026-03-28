import subprocess
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("AppleScriptTest")

def send_test(handle, text):
    safe_text = text.replace('"', '\\"').replace('\n', '\\r')
    script = f'''
    tell application "Messages"
        set targetBuddy to buddy "{handle}" of (service 1 whose service type is iMessage)
        send "{safe_text}" to targetBuddy
    end tell
    '''
    print(f"Executing AppleScript for handle: {handle}...")
    try:
        result = subprocess.run(["osascript", "-e", script], check=True, capture_output=True)
        print("SUCCESS: Message sent.")
        return True
    except subprocess.CalledProcessError as e:
        print(f"FAILED: {e.stderr.decode().strip()}")
        return False

if __name__ == "__main__":
    # Test with the detected handle and a simple message
    # Note: This will actually send a message to the user!
    send_test("+36706010707", "Sovereign Vanguard: Connection established. Hardened protocol active.")
