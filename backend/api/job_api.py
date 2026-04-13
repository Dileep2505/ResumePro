from fastapi import APIRouter
from backend.services.job_matcher import match_jobs

router = APIRouter()

@router.post("/match")
def match(skills: list[str]):
    return {"matches": match_jobs(skills)}