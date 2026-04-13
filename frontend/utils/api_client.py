import requests

BASE_URL = "http://127.0.0.1:8001"

def analyze_resume(file):
    return requests.post(
        f"{BASE_URL}/resume/analyze",
        files={"file": file}
    ).json()