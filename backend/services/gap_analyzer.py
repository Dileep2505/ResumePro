def find_gap(user_skills, required_skills):
    return list(set(required_skills) - set(user_skills))