def _to_float(value, default=0.0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def categorize_jobs(matches):
    eligible = []
    nearly = []
    not_ready = []

    for job in matches or []:
        if not isinstance(job, dict):
            continue

        score = _to_float(job.get("match"), 0.0)

        if score >= 70:
            eligible.append(job)
        elif score >= 40:
            nearly.append(job)
        else:
            not_ready.append(job)

    return {
        "eligible": eligible,
        "nearly_eligible": nearly,
        "not_ready": not_ready,
    }