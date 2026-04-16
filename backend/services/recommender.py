learning_map = {
    "python": ["Build projects", "Practice DSA"],
    "sql": ["Learn joins", "Practice queries"],
    "machine learning": ["Coursera ML course", "Kaggle practice"],
    "react": ["React docs", "Build frontend apps"],
    "django": ["Build backend APIs"]
}

def recommend(missing_skills):
    return {
        skill: learning_map.get(skill, ["Learn basics"])
        for skill in missing_skills
    }