from fastapi import APIRouter
from backend.services.career_explorer import categorize_jobs

router = APIRouter()

@router.post("/explore")
def explore(data: dict):
    matches = data.get("matches", [])
    result = categorize_jobs(matches)
    return result