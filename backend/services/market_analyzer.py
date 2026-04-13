from collections import Counter
import pandas as pd

jobs = pd.read_csv("data/jobs.csv")

def analyze():
    all_skills = []

    for skills in jobs["skills"]:
        all_skills.extend(skills.split(","))

    return dict(Counter(all_skills))