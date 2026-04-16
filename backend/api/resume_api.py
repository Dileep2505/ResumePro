from fastapi import APIRouter, UploadFile, File, HTTPException
from pydantic import BaseModel
from backend.services.parser import extract_text, extract_resume_data
from backend.services.skill_extractor import extract_skills, extract_skills_from_text
from backend.services.scorer import calculate_ats_score

router = APIRouter()

class JDRequest(BaseModel):
    jd_text: str


class ATSScoreRequest(BaseModel):
    resume_text: str
    resume_data: dict | None = None
    job_description: str | None = None


def _normalize_section_items(items):
    normalized = []
    for item in items or []:
        if isinstance(item, str):
            normalized.append(item)
            continue
        if isinstance(item, dict):
            normalized.append(item.get("raw") or item.get("title") or item.get("degree") or "")
            continue
        normalized.append(str(item))
    return [value for value in normalized if value]


def _normalize_education_items(items):
    normalized = []
    for item in items or []:
        if isinstance(item, str):
            text = item.strip()
            if text:
                normalized.append({
                    "degree": "",
                    "institution": "",
                    "location": "",
                    "years": "",
                    "gpa": "",
                    "raw": text,
                })
            continue

        if isinstance(item, dict):
            degree = str(item.get("degree") or "").strip()
            institution = str(item.get("institution") or "").strip()
            location = str(item.get("location") or "").strip()
            years = str(item.get("years") or item.get("date") or "").strip()
            gpa = str(item.get("gpa") or item.get("score") or "").strip()
            raw = str(item.get("raw") or "").strip()

            if not raw:
                raw = " | ".join(part for part in [institution, degree, location, years, gpa] if part)

            if any([degree, institution, location, years, gpa, raw]):
                normalized.append({
                    "degree": degree,
                    "institution": institution,
                    "location": location,
                    "years": years,
                    "gpa": gpa,
                    "raw": raw,
                })
            continue

        text = str(item or "").strip()
        if text:
            normalized.append({
                "degree": "",
                "institution": "",
                "location": "",
                "years": "",
                "gpa": "",
                "raw": text,
            })

    return normalized


def _prepare_resume_data(resume_data):
    resume_data = resume_data or {}
    resume_data["education"] = _normalize_education_items(resume_data.get("education", []))
    resume_data["projects"] = _normalize_section_items(resume_data.get("projects", []))
    resume_data["experience"] = _normalize_section_items(resume_data.get("experience", []))
    resume_data["certifications"] = _normalize_section_items(resume_data.get("certifications", []))
    return resume_data


from fastapi import APIRouter, UploadFile, File, HTTPException

router = APIRouter()

ALLOWED_TYPES = {"application/pdf", 
                 "application/vnd.openxmlformats-officedocument.wordprocessingml.document"}

MAX_FILE_SIZE = 5 * 1024 * 1024  # 5MB


@router.post("/analyze")
async def analyze_resume(file: UploadFile = File(...)):
    try:
        # Validate file type
        if file.content_type not in ALLOWED_TYPES:
            raise HTTPException(status_code=400, detail="Only PDF and DOCX files are allowed")

        # Read file
        file_bytes = await file.read()

        # Validate size
        if not file_bytes:
            raise HTTPException(status_code=400, detail="Empty file uploaded")

        if len(file_bytes) > MAX_FILE_SIZE:
            raise HTTPException(status_code=400, detail="File too large (max 5MB)")

        # Extract text
        raw_text = extract_text(file_bytes)
        if not raw_text or not raw_text.strip():
            raise HTTPException(status_code=400, detail="Could not extract text from resume")

        # Extract structured data
        extracted_data = extract_resume_data(raw_text)
        resume_data = _prepare_resume_data(extracted_data or {})

        # Skills + ATS
        skills = extract_skills_from_text(raw_text)
        ats_data = calculate_ats_score(raw_text, resume_data, None)

        return {
            "skills": skills or [],
            "resume_data": resume_data,
            "raw_text": raw_text,
            "ats_data": ats_data,
        }

    except HTTPException:
        raise

    except Exception as exc:
        # Log the real error internally (important)
        print(f"Error processing resume: {exc}")

        raise HTTPException(
            status_code=500,
            detail="Internal server error while processing resume"
        ) from exc
        
@router.post("/jd/analyze")
async def analyze_job_description(payload: JDRequest):
    """
    Analyzes job description text to extract relevant skills.
    """
    skills = extract_skills_from_text(payload.jd_text)
    return {"job_skills": skills}



from fastapi import Request

@router.api_route("/resume/ats-score", methods=["GET", "POST"])
async def ats_score(request: Request):
    if request.method == "GET":
        return {"message": "ATS score endpoint. Please use POST with resume data."}
    payload = await request.json()
    # If using Pydantic model validation, you can do:
    # payload = ATSScoreRequest(**payload)
    resume_data = _prepare_resume_data(payload.get("resume_data") or {})
    ats_data = calculate_ats_score(payload.get("resume_text"), resume_data, payload.get("job_description") or "")
    return {"ats_data": ats_data}