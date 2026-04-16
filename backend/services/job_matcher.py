import pandas as pd
from backend.services.gap_analyzer import find_gap
from backend.services.recommender import recommend

jobs = pd.read_csv("data/jobs.csv")

def match_jobs(user_skills):
    results = []

    user_skills = [s.lower() for s in user_skills]

    for _, row in jobs.iterrows():
        required = [s.strip().lower() for s in row["skills"].split(",")]

        matched = len(set(user_skills) & set(required))
        total = len(required)

        score = (matched / total) * 100 if total else 0

        # 🔥 NEW FEATURES
        missing = find_gap(user_skills, required)
        recs = recommend(missing)

        results.append({
            "role": row["title"],
            "match": round(score, 2),
            "missing_skills": missing,
            "recommendations": recs
        })

    return results