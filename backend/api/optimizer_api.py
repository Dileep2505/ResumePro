from fastapi import APIRouter
from backend.services import optimizer

router = APIRouter()

@router.post("/optimize")
def optimize(data: dict):
    user_skills = data.get("user_skills", [])
    job_skills = data.get("job_skills", [])

    from backend.services.optimizer import optimize_resume

    result = optimize_resume(user_skills, job_skills)

    return result