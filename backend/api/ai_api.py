import json
import os
import urllib.error
import urllib.request
from typing import Any
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from backend.services.scorer import calculate_ats_score

router = APIRouter()


class RewriteSuggestionRequest(BaseModel):
    resume_text: str = ""
    resume_data: dict[str, Any] | None = None
    job_description: str = ""
    ats_data: dict[str, Any] | None = None


GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
DEFAULT_GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.1-70b-versatile")


def _load_env_file() -> None:
    env_path = Path(__file__).resolve().parents[2] / ".env"
    if not env_path.exists():
        return

    for line in env_path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_env_file()


def _build_prompt(payload: RewriteSuggestionRequest, ats_data: dict[str, Any]) -> list[dict[str, str]]:
    resume_data = payload.resume_data or {}
    prompt = {
        "resume_text": payload.resume_text[:12000],
        "resume_data": resume_data,
        "job_description": payload.job_description[:12000],
        "ats_score": ats_data.get("score"),
        "ats_label": ats_data.get("label"),
        "missing_keywords": ats_data.get("missing_keywords", []),
        "detected_sections": ats_data.get("detected_sections", {}),
        "breakdown": ats_data.get("breakdown", {}),
        "recommendations": ats_data.get("recommendations", []),
    }

    system = (
        "You are an ATS resume optimization assistant. "
        "Return only valid JSON with keys: summary, score_gain, rewritten_summary, rewritten_bullets, "
        "rewrite_suggestions, where_to_change, what_to_add, prioritized_actions. "
        "Write like a professional resume editor. Remove weak or repeated wording from the user's resume text. "
        "Prefer strong, concise, role-focused phrasing. Do not copy the user's sentence structure. "
        "Provide a rewritten summary and 3 to 5 rewritten bullet examples that can replace the original wording. "
        "Do not mention that you are an AI model."
    )

    user = (
        "Analyze the resume and job description and give rewrite suggestions that increase ATS score.\n\n"
        "Rewrite the user's wording into stronger, more concise resume language. Avoid repeating the original sentence structure.\n"
        "Focus on replacing weak phrases with role-aligned, high-impact wording.\n\n"
        f"INPUT JSON:\n{json.dumps(prompt, ensure_ascii=False)}"
    )

    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]


def _fallback_rewrite(ats_data: dict[str, Any]) -> dict[str, Any]:
    missing_keywords = ats_data.get("missing_keywords", [])
    detected_sections = ats_data.get("detected_sections", {})
    breakdown = ats_data.get("breakdown", {})

    prioritized_actions: list[dict[str, str]] = []

    if missing_keywords:
        prioritized_actions.append({
            "title": "Add JD keywords",
            "location": "Summary, Skills, Experience, Projects",
            "action": f"Add the top missing keywords naturally: {', '.join(missing_keywords[:6])}.",
        })
    if not detected_sections.get("summary"):
        prioritized_actions.append({
            "title": "Write a summary",
            "location": "Top of resume",
            "action": "Add a concise 2-4 line summary targeted to the role.",
        })
    if not detected_sections.get("experience"):
        prioritized_actions.append({
            "title": "Strengthen experience",
            "location": "Experience section",
            "action": "Add 3-5 bullets with action verbs and measurable outcomes.",
        })
    if not detected_sections.get("projects"):
        prioritized_actions.append({
            "title": "Add projects",
            "location": "Projects section",
            "action": "Add 2-3 projects with tools used, your role, and measurable impact.",
        })
    if (breakdown.get("impact", 0) or 0) < 5:
        prioritized_actions.append({
            "title": "Quantify impact",
            "location": "Experience and Projects bullets",
            "action": "Use numbers like %, time saved, scale, accuracy, or users.",
        })

    return {
        "summary": "Use the prioritized actions below to improve ATS match and shortlisting potential.",
        "score_gain": max(5, min(20, len(missing_keywords) + (0 if detected_sections.get("summary") else 4) + (0 if detected_sections.get("experience") else 4))),
        "rewritten_summary": "Results-driven candidate with hands-on experience delivering practical solutions, improving outcomes, and applying relevant tools to build measurable impact.",
        "rewritten_bullets": [
            "Improved process efficiency by applying tools and structured execution to deliver measurable outcomes.",
            "Built and refined project features with clear ownership, consistent delivery, and ATS-relevant keywords.",
            "Collaborated across tasks and priorities to achieve stronger results and better alignment with role requirements.",
        ],
        "rewrite_suggestions": [
            "Make the top section role-specific and keyword-rich.",
            "Mirror the JD language in bullets without keyword stuffing.",
            "Turn responsibilities into results using numbers and impact.",
        ],
        "where_to_change": [
            "Top header",
            "Summary",
            "Skills",
            "Experience",
            "Projects",
        ],
        "what_to_add": missing_keywords[:8],
        "prioritized_actions": prioritized_actions,
    }


@router.post("/rewrite-suggestions")
def rewrite_suggestions(payload: RewriteSuggestionRequest):
    api_key = os.getenv("GROQ_API_KEY", "").strip()
    ats_data = payload.ats_data or calculate_ats_score(payload.resume_text, payload.resume_data or {}, payload.job_description or "")

    if not api_key:
        return {
            "provider": "heuristic",
            "model": "fallback",
            "ats_data": ats_data,
            "rewrite": _fallback_rewrite(ats_data),
        }

    messages = _build_prompt(payload, ats_data)

    request_body = json.dumps(
        {
            "model": DEFAULT_GROQ_MODEL,
            "messages": messages,
            "temperature": 0.4,
            "max_tokens": 900,
        }
    ).encode("utf-8")

    request = urllib.request.Request(
        GROQ_API_URL,
        data=request_body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            response_payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        error_body = exc.read().decode("utf-8", errors="ignore")
        return {
            "provider": "heuristic",
            "model": "fallback",
            "ats_data": ats_data,
            "rewrite": _fallback_rewrite(ats_data),
            "warning": f"Groq API request failed: {error_body}",
        }
    except Exception as exc:
        return {
            "provider": "heuristic",
            "model": "fallback",
            "ats_data": ats_data,
            "rewrite": _fallback_rewrite(ats_data),
            "warning": f"Unable to generate rewrite suggestions: {exc}",
        }

    try:
        content = response_payload["choices"][0]["message"]["content"].strip()
        parsed = json.loads(content)
    except Exception as exc:
        return {
            "provider": "heuristic",
            "model": "fallback",
            "ats_data": ats_data,
            "rewrite": _fallback_rewrite(ats_data),
            "warning": f"Groq response parsing failed: {exc}",
        }

    return {
        "provider": "groq",
        "model": DEFAULT_GROQ_MODEL,
        "ats_data": ats_data,
        "rewrite": parsed,
    }
