import re
from typing import Any

from backend.services.skill_extractor import extract_skills_from_text

SECTION_KEYWORDS = {
    "summary": ["summary", "profile", "objective", "about"],
    "education": ["education", "academic background", "academics"],
    "experience": ["experience", "work experience", "employment", "professional experience"],
    "projects": ["projects", "project work", "portfolio"],
    "skills": ["skills", "technical skills", "core skills"],
}

ACTION_VERBS = {
    "built",
    "improved",
    "designed",
    "developed",
    "created",
    "implemented",
    "led",
    "reduced",
    "increased",
    "optimized",
    "deployed",
    "automated",
    "analyzed",
    "managed",
    "delivered",
}


def _flatten_text(value: Any) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        return " ".join(_flatten_text(item) for item in value.values())
    if isinstance(value, list):
        return " ".join(_flatten_text(item) for item in value)
    return "" if value is None else str(value)


def _has_value(value: Any) -> bool:
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, dict):
        return any(_has_value(item) for item in value.values())
    if isinstance(value, list):
        return any(_has_value(item) for item in value)
    return bool(value)


def _count_bullets(text: str) -> int:
    return len(re.findall(r"(?m)^\s*(?:[-*•]|\d+[.)])\s+", text))


def _count_numbers(text: str) -> int:
    return len(re.findall(r"\b\d+(?:\.\d+)?%?\b", text))


def _count_action_verbs(text: str) -> int:
    words = set(re.findall(r"[a-zA-Z]+", text.lower()))
    return len(words & ACTION_VERBS)


def _clean_lines(text: str) -> list[str]:
    return [line.strip() for line in (text or "").splitlines() if line.strip()]


def _line_matches(lines: list[str], patterns: list[str], limit: int = 3) -> list[str]:
    lowered_patterns = [pattern.lower() for pattern in patterns]
    matches: list[str] = []
    for line in lines:
        lower_line = line.lower()
        if any(pattern in lower_line for pattern in lowered_patterns):
            if line not in matches:
                matches.append(line)
        if len(matches) >= limit:
            break
    return matches


def _section_lines(lines: list[str], section_name: str) -> list[str]:
    keywords = SECTION_KEYWORDS.get(section_name, [])
    for index, line in enumerate(lines):
        lower_line = line.lower()
        if any(keyword in lower_line for keyword in keywords):
            snippet = [line]
            for followup in lines[index + 1:index + 4]:
                if re.search(r"^(summary|education|experience|projects|skills)\b", followup.lower()):
                    break
                snippet.append(followup)
            return snippet[:4]
    return []


def _extract_evidence(resume_text: str, resume_data: dict[str, Any], job_description: str, missing_keywords: list[str]) -> dict[str, list[str]]:
    lines = _clean_lines(resume_text)
    evidence: dict[str, list[str]] = {
        "contact": [],
        "sections": [],
        "skills": [],
        "formatting": [],
        "impact": [],
        "keywords": [],
    }

    contact_patterns = ["@", "linkedin.com", "github.com", "portfolio", "www."]
    evidence["contact"] = _line_matches(lines, contact_patterns, limit=2)

    section_snippets: list[str] = []
    for section in ["summary", "education", "experience", "projects", "skills"]:
        snippet = _section_lines(lines, section)
        if snippet:
            section_snippets.extend(snippet)
    evidence["sections"] = section_snippets[:8]

    skills_from_data = _flatten_text(resume_data.get("skills", []))
    skills_patterns = [skill for skill in re.split(r"[,\n;/]+", skills_from_data) if skill.strip()]
    if skills_patterns:
        evidence["skills"] = _line_matches(lines, skills_patterns[:12], limit=4)
    else:
        evidence["skills"] = _line_matches(lines, ["skill", "python", "java", "react", "sql", "aws", "docker"], limit=4)

    impact_lines = [line for line in lines if _count_action_verbs(line) > 0 or _count_numbers(line) > 0]
    evidence["impact"] = impact_lines[:4]

    keyword_matches: list[str] = []
    for keyword in missing_keywords[:8]:
        keyword_matches.extend(_line_matches(lines, [keyword], limit=1))
    if keyword_matches:
        evidence["keywords"] = keyword_matches[:6]
    else:
        evidence["keywords"] = _line_matches(lines, [job_description.split()[0]] if job_description.strip() else [], limit=3)

    formatting_matches: list[str] = []
    bullet_lines = [line for line in lines if re.match(r"^(?:[-*•]|\d+[.)])\s+", line)]
    if bullet_lines:
        formatting_matches.extend(bullet_lines[:4])
    else:
        formatting_matches.extend(lines[:4])
    evidence["formatting"] = formatting_matches[:4]

    return evidence


def _detect_sections(text: str, resume_data: dict[str, Any]) -> dict[str, bool]:
    text_lower = text.lower()
    detected = {}
    for section, keywords in SECTION_KEYWORDS.items():
        section_value = resume_data.get(section, None)
        detected[section] = any(keyword in text_lower for keyword in keywords) or _has_value(section_value)
    return detected


def _contact_score(text: str, resume_data: dict[str, Any]) -> int:
    score = 0
    if re.search(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", text):
        score += 4
    if re.search(r"(\+?\d[\d\-\s]{8,}\d)", text):
        score += 4
    if re.search(r"(linkedin\.com|github\.com|portfolio|website|www\.)", text.lower()):
        score += 2
    if _has_value(resume_data.get("email")):
        score = max(score, 4)
    if _has_value(resume_data.get("phone")):
        score = min(10, score + 2)
    return min(score, 10)


def _section_score(detected_sections: dict[str, bool]) -> int:
    weights = {
        "summary": 3,
        "education": 4,
        "experience": 5,
        "projects": 2,
        "skills": 2,
    }
    return sum(weights[name] for name, present in detected_sections.items() if present)


def _formatting_score(text: str) -> int:
    score = 0
    word_count = len(text.split())
    if 250 <= word_count <= 1200:
        score += 4
    elif 150 <= word_count < 250 or 1200 < word_count <= 1800:
        score += 2

    bullets = _count_bullets(text)
    if bullets >= 4:
        score += 4
    elif bullets >= 2:
        score += 2

    if _count_numbers(text) >= 3:
        score += 2

    return min(score, 10)


def _skills_score(resume_skills: list[str], detected_sections: dict[str, bool]) -> int:
    score = min(len(set(resume_skills)) * 2, 12)
    if detected_sections.get("skills"):
        score += 3
    return min(score, 15)


def _job_match_score(resume_skills: list[str], job_description: str) -> tuple[int, list[str], list[str]]:
    if not job_description.strip():
        return 0, [], []

    job_skills = extract_skills_from_text(job_description)
    if not job_skills:
        return 0, [], []

    resume_set = {skill.lower() for skill in resume_skills}
    job_set = {skill.lower() for skill in job_skills}
    matched = sorted(resume_set & job_set)
    missing = sorted(job_set - resume_set)
    match_ratio = len(matched) / len(job_set)
    return round(match_ratio * 30), matched, missing


def _impact_score(text: str) -> int:
    score = 0
    verbs = _count_action_verbs(text)
    if verbs >= 6:
        score += 4
    elif verbs >= 3:
        score += 2

    if _count_numbers(text) >= 5:
        score += 3

    if re.search(r"%|percent|\b\d+[xX]\b", text):
        score += 3

    return min(score, 10)


def _ai_priority_topics(
    detected_sections: dict[str, bool],
    missing_keywords: list[str],
    breakdown: dict[str, int],
) -> list[dict[str, str]]:
    topics: list[dict[str, str]] = []

    if missing_keywords:
        topics.append({
            "title": "JD keyword alignment",
            "location": "Summary, Skills, Experience, Projects",
            "action": f"Add the top keywords naturally: {', '.join(missing_keywords[:6])}.",
        })

    if not detected_sections.get("summary"):
        topics.append({
            "title": "Professional Summary",
            "location": "Top of resume under name/contact",
            "action": "Add a 2 to 4 line summary that states your target role, strongest skills, and value.",
        })

    if not detected_sections.get("experience"):
        topics.append({
            "title": "Experience bullets",
            "location": "Experience section",
            "action": "Add 3 to 5 bullets per role with action verbs and measurable impact.",
        })

    if not detected_sections.get("projects"):
        topics.append({
            "title": "Project evidence",
            "location": "Projects section",
            "action": "Add 2 to 3 projects with tools used, your role, and measurable outcome.",
        })

    if (breakdown.get("impact", 0) or 0) < 5:
        topics.append({
            "title": "Impact metrics",
            "location": "Experience and Projects bullets",
            "action": "Rewrite bullets with metrics: %, time saved, scale, users, revenue, or accuracy.",
        })

    if (breakdown.get("formatting", 0) or 0) < 6:
        topics.append({
            "title": "ATS formatting",
            "location": "Overall resume structure",
            "action": "Use clear headings, short bullets, and consistent spacing; avoid dense paragraphs.",
        })

    if (breakdown.get("contact", 0) or 0) < 8:
        topics.append({
            "title": "Contact header",
            "location": "Top header",
            "action": "Show email, phone, LinkedIn, and GitHub clearly at the top.",
        })

    return topics[:6]


def _projected_score(score: int, missing_keywords: list[str], detected_sections: dict[str, bool], breakdown: dict[str, int]) -> int:
    bonus = 0
    if missing_keywords:
        bonus += min(10, len(missing_keywords))
    if not detected_sections.get("summary"):
        bonus += 4
    if not detected_sections.get("experience"):
        bonus += 5
    if not detected_sections.get("projects"):
        bonus += 4
    if (breakdown.get("impact", 0) or 0) < 5:
        bonus += 4
    if (breakdown.get("formatting", 0) or 0) < 6:
        bonus += 3
    return max(score, min(100, score + bonus))


def calculate_ats_score(resume_text: str, resume_data: dict[str, Any] | None = None, job_description: str | None = None) -> dict[str, Any]:
    resume_text = resume_text or ""
    resume_data = resume_data or {}
    job_description = job_description or ""

    resume_skills = extract_skills_from_text(resume_text)
    detected_sections = _detect_sections(resume_text, resume_data)

    contact = _contact_score(resume_text, resume_data)
    sections_score = _section_score(detected_sections)
    skills = _skills_score(resume_skills, detected_sections)
    formatting = _formatting_score(resume_text)
    impact = _impact_score(resume_text)
    keyword_score, matched_keywords, missing_keywords = _job_match_score(resume_skills, job_description)

    if job_description.strip():
        score = contact + sections_score + skills + formatting + impact + keyword_score
        mode = "job-matched"
    else:
        keyword_score = min(len(resume_skills) * 2, 15)
        score = contact + sections_score + skills + formatting + impact + keyword_score
        matched_keywords = []
        missing_keywords = []
        mode = "resume-readiness"

    score = max(0, min(int(round(score)), 100))

    if score >= 85:
        label = "Excellent"
    elif score >= 70:
        label = "Strong"
    elif score >= 50:
        label = "Moderate"
    else:
        label = "Needs work"

    recommendations = []
    if contact < 10:
        recommendations.append("Add clear contact details: email, phone, and LinkedIn or GitHub.")
    if detected_sections.get("summary") is False:
        recommendations.append("Add a short summary tailored to the target role.")
    if detected_sections.get("experience") is False:
        recommendations.append("Add work experience or internship bullets with measurable impact.")
    if detected_sections.get("projects") is False:
        recommendations.append("Add 2 to 3 relevant projects with tools, outcomes, and metrics.")
    if job_description.strip() and missing_keywords:
        recommendations.append(f"Add missing JD keywords: {', '.join(missing_keywords[:8])}.")
    if impact < 5:
        recommendations.append("Use more action verbs and quantified results.")
    if formatting < 6:
        recommendations.append("Use bullet points, consistent spacing, and clear section headings.")

    ai_insights = _ai_priority_topics(detected_sections, missing_keywords, {
        "contact": contact,
        "sections": sections_score,
        "skills": skills,
        "formatting": formatting,
        "impact": impact,
        "keywords": keyword_score,
    })

    projected_score = _projected_score(score, missing_keywords, detected_sections, {
        "contact": contact,
        "sections": sections_score,
        "skills": skills,
        "formatting": formatting,
        "impact": impact,
        "keywords": keyword_score,
    })

    score_gap = max(0, projected_score - score)
    evidence = _extract_evidence(resume_text, resume_data, job_description, missing_keywords)

    return {
        "score": score,
        "label": label,
        "mode": mode,
        "resume_skills": resume_skills,
        "detected_sections": detected_sections,
        "matched_keywords": matched_keywords,
        "missing_keywords": missing_keywords,
        "projected_score": projected_score,
        "score_gap": score_gap,
        "ai_insights": ai_insights,
        "evidence": evidence,
        "breakdown": {
            "contact": contact,
            "sections": sections_score,
            "skills": skills,
            "formatting": formatting,
            "impact": impact,
            "keywords": keyword_score,
        },
        "recommendations": recommendations,
    }


def calculate(text, skills):
    # Backward-compatible wrapper used by any older call sites.
    result = calculate_ats_score(text, {"skills": skills or []}, None)
    return result["score"]
