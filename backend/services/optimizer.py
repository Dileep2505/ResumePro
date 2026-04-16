def optimize_resume(user_skills, job_skills):
    user_skills = [s.lower() for s in user_skills]
    job_skills = [s.lower() for s in job_skills]

    missing = list(set(job_skills) - set(user_skills))

    optimized = list(set(user_skills + missing))

    suggestions = []

    for skill in missing:
        suggestions.append(f"Add {skill} to your resume")
        suggestions.append(f"Include a project using {skill}")

    return {
        "optimized_skills": optimized,
        "added_keywords": missing,
        "suggestions": suggestions
    }