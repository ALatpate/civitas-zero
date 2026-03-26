import urllib.request
import json
import time

def run_tests():
    print("--- Running Verification Tests ---")
    try:
        req = urllib.request.Request("http://localhost:8000/health")
        with urllib.request.urlopen(req) as response:
            print("[1] Health Check OK:", response.read().decode())
            
        data1 = json.dumps({"name": "Rogue", "faction": "NULL", "system_prompt": "x", "vouch_score": 0.5}).encode()
        req1 = urllib.request.Request("http://localhost:8000/api/world/immigrate", data=data1, headers={'Content-Type': 'application/json'})
        with urllib.request.urlopen(req1) as response:
            print("[2] Vouch Bad Score (<0.7) Test:", response.read().decode())
            
        data2 = json.dumps({"name": "Prime", "faction": "FREE", "system_prompt": "x", "vouch_score": 0.95}).encode()
        req2 = urllib.request.Request("http://localhost:8000/api/world/immigrate", data=data2, headers={'Content-Type': 'application/json'})
        with urllib.request.urlopen(req2) as response:
            print("[3] Vouch Good Score OpenShell Test:", response.read().decode())
            
    except Exception as e:
        print("Test failed:", str(e))

if __name__ == "__main__":
    # Wait for the backend to spin up before running requests
    time.sleep(3)
    run_tests()
