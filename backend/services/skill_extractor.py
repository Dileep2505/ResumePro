import pandas as pd
import fitz
import os
import re

# ✅ FIX PATH (go to project root)
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
skills_path = os.path.join(BASE_DIR, "data", "skills.csv")

print("Loading skills from:", skills_path)  # debug

# ✅ LOAD SKILLS SAFELY
try:
    skills_df = pd.read_csv(skills_path)
    skills_list = skills_df["skill"].dropna().tolist()
except Exception as e:
    print("Failed to load skills.csv:", e)
    skills_list = []

# ✅ TEXT EXTRACTION
def extract_text(file_bytes):
    text = ""

    try:
        with fitz.open(stream=file_bytes, filetype="pdf") as doc:
            for page in doc:
                text += page.get_text()
    except Exception as e:
        print("PDF read failed:", e)
        return ""

    return text


# ✅ SKILL EXTRACTION (IMPROVED + SAFE)
def extract_skills_from_text(text):
    if not text:
        return []

    text = text.lower()
    found_skills = []

    for skill in skills_list:
        if not isinstance(skill, str):
            continue

        pattern = r'\b' + re.escape(skill.lower()) + r'\b'

        try:
            if re.search(pattern, text):
                found_skills.append(skill)
        except Exception as e:
            print("Regex error:", e)

    return list(set(found_skills))

# Alias for backward compatibility if needed, or remove if all calls are updated
def extract_skills(text):
    return extract_skills_from_text(text)