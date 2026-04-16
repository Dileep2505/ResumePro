import io
import re
import zipfile
from xml.etree import ElementTree as ET

from PyPDF2 import PdfReader


EDUCATION_HEADER_RE = re.compile(r"^(education|academic\s+background|academics?)\s*[:\-]?$", re.IGNORECASE)
CERTIFICATION_HEADER_RE = re.compile(
    r"^(certifications?|licenses?|licenses?\s+and\s+certifications?|professional\s+certifications?)\s*[:\-]?$",
    re.IGNORECASE,
)
STOP_SECTION_RE = re.compile(
    r"^(summary|profile|about\s+me|experience|work\s+experience|projects?|skills?|technical\s+skills?|certifications?|achievements?|awards?|languages?|contact)\s*[:\-]?$",
    re.IGNORECASE,
)
CERT_STOP_SECTION_RE = re.compile(
    r"^(summary|profile|about\s+me|experience|work\s+experience|projects?|education|skills?|technical\s+skills?|achievements?|awards?|positions?\s+of\s+responsibility|languages?|interests?|hobbies|contact)\s*[:\-]?$",
    re.IGNORECASE,
)
CERT_KEYWORD_RE = re.compile(
    r"\b(certified|certification|certificate|license|licensed|pmp|cissp|aws\s+certified|azure\s+certified|google\s+cloud\s+certified|scrum\s+master|itil|comptia|oracle\s+certified|salesforce\s+certified)\b",
    re.IGNORECASE,
)
CERT_PROVIDER_RE = re.compile(
    r"\b(coursera|udemy|edx|linkedin\s*learning|aws|microsoft|google|oracle|ibm|cisco|comp\s*tia|pmi|isaca|salesforce|kubernetes|red\s*hat)\b",
    re.IGNORECASE,
)
CERT_DATE_RE = re.compile(r"\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{4}\b|\b(?:19|20)\d{2}\b", re.IGNORECASE)
CERT_URL_RE = re.compile(r"(https?://[^\s|]+|www\.[^\s|]+)", re.IGNORECASE)
DATE_RANGE_RE = re.compile(
    r"((?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{4}\s*[-–]\s*(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{4}|"
    r"(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{4}\s*[-–]\s*(?:\d{4}|present|current)|"
    r"\d{4}\s*[-–]\s*(?:\d{4}|present|current))",
    re.IGNORECASE,
)
DEGREE_RE = re.compile(
    r"\b(b\.?\s?tech|m\.?\s?tech|b\.?\s?e\.?|m\.?\s?e\.?|bachelor(?:'s)?|master(?:'s)?|ph\.?d|mba|mca|bca|diploma|intermediate|ssc|hsc|10th|12th|associate(?:'s)?)\b",
    re.IGNORECASE,
)
INSTITUTION_RE = re.compile(r"\b(university|college|institute|school|academy|polytechnic)\b", re.IGNORECASE)
GPA_RE = re.compile(r"\b(?:cgpa|gpa|score|percentage|percent)\b\s*[:\-]?\s*([\d.]+%?)", re.IGNORECASE)
LOCATION_RE = re.compile(r"\b([A-Za-z .'-]+,\s*[A-Za-z .'-]{2,})\b")


def _line_is_section_header(line):
    return bool(STOP_SECTION_RE.match((line or "").strip()))


def _line_looks_like_institution(line):
    clean = (line or "").strip()
    if not clean:
        return False
    if DEGREE_RE.search(clean) or DATE_RANGE_RE.search(clean):
        return False
    if INSTITUTION_RE.search(clean):
        return True
    words = clean.split()
    if len(words) <= 7 and re.match(r"^[A-Za-z][A-Za-z0-9 .&'/-]+$", clean):
        return sum(1 for token in words if token[:1].isupper()) >= max(1, len(words) - 1)
    return False


def _merge_line_into_education(entry, line):
    clean = (line or "").strip()
    if not clean:
        return

    entry["raw_lines"].append(clean)

    if not entry.get("years"):
        date_match = DATE_RANGE_RE.search(clean)
        if date_match:
            entry["years"] = date_match.group(1).replace("  ", " ").strip()

    if not entry.get("gpa"):
        gpa_match = GPA_RE.search(clean)
        if gpa_match:
            entry["gpa"] = gpa_match.group(1).strip()

    if not entry.get("location"):
        location_match = LOCATION_RE.search(clean)
        if location_match and len(location_match.group(1).split()) <= 8:
            entry["location"] = location_match.group(1).strip(" -|,;")

    if DEGREE_RE.search(clean):
        if not entry.get("degree"):
            entry["degree"] = clean
        return

    if _line_looks_like_institution(clean) and not entry.get("institution"):
        entry["institution"] = clean


def _finalize_education_entry(entry):
    raw_lines = entry.get("raw_lines") or []
    raw = " | ".join(raw_lines).strip(" |")
    institution = (entry.get("institution") or "").strip()
    degree = (entry.get("degree") or "").strip()
    years = (entry.get("years") or "").strip()
    gpa = (entry.get("gpa") or "").strip()
    location = (entry.get("location") or "").strip()

    if not institution and raw_lines:
        first = raw_lines[0]
        if not DEGREE_RE.search(first) and not DATE_RANGE_RE.search(first):
            institution = first
    if not degree and len(raw_lines) > 1:
        candidate = raw_lines[1]
        if DEGREE_RE.search(candidate) or (not _line_looks_like_institution(candidate) and not DATE_RANGE_RE.search(candidate)):
            degree = candidate

    if not any([institution, degree, years, gpa, location, raw]):
        return None

    return {
        "degree": degree,
        "institution": institution,
        "location": location,
        "years": years,
        "gpa": gpa,
        "raw": raw,
    }


def _extract_education_data(lines):
    education_lines = []
    in_education = False

    for line in lines:
        clean = (line or "").strip()
        if not clean:
            continue

        if EDUCATION_HEADER_RE.match(clean):
            in_education = True
            continue

        if in_education and _line_is_section_header(clean):
            break

        if in_education:
            education_lines.append(clean)

    # Fallback: scan full resume if explicit education section is missing.
    if not education_lines:
        for line in lines:
            clean = (line or "").strip()
            if not clean:
                continue
            if DEGREE_RE.search(clean) or INSTITUTION_RE.search(clean):
                education_lines.append(clean)

    entries = []
    current = None

    def flush_current():
        nonlocal current
        if not current:
            return
        finalized = _finalize_education_entry(current)
        if finalized:
            entries.append(finalized)
        current = None

    for line in education_lines:
        clean = line.strip()
        if not clean:
            continue

        starts_new = _line_looks_like_institution(clean)
        if starts_new and current and (current.get("institution") or current.get("degree") or current.get("years")):
            flush_current()

        if current is None:
            current = {"institution": "", "degree": "", "location": "", "years": "", "gpa": "", "raw_lines": []}

        _merge_line_into_education(current, clean)

    flush_current()

    deduped = []
    seen = set()
    for entry in entries:
        key = (entry.get("raw") or "").lower().strip()
        if not key or key in seen:
            continue
        seen.add(key)
        deduped.append(entry)

    return deduped


def _extract_docx_text(file_bytes):
    with zipfile.ZipFile(io.BytesIO(file_bytes)) as archive:
        document_xml = archive.read("word/document.xml")

    root = ET.fromstring(document_xml)
    namespace = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
    paragraphs = []

    for paragraph in root.findall(".//w:p", namespace):
        parts = [node.text for node in paragraph.findall(".//w:t", namespace) if node.text]
        if parts:
            paragraphs.append("".join(parts))

    return "\n".join(paragraphs).strip()


def _clean_section_line(value):
    return re.sub(r"^[\u2022\-*\s\d.)]+", "", str(value or "")).strip()


def _extract_certifications_data(lines):
    cert_lines = []
    in_certifications = False

    for raw_line in lines:
        line = (raw_line or "").strip()
        if not line:
            continue

        if CERTIFICATION_HEADER_RE.match(line):
            in_certifications = True
            continue

        if in_certifications and CERT_STOP_SECTION_RE.match(line):
            break

        if in_certifications:
            cert_lines.append(line)

    if not cert_lines:
        for raw_line in lines:
            line = (raw_line or "").strip()
            if not line:
                continue
            if CERT_KEYWORD_RE.search(line):
                cert_lines.append(line)

    entries = []
    current = None
    pending_details = []
    pending_dates = []
    pending_labels = []

    def _is_date_only(value):
        return bool(re.fullmatch(CERT_DATE_RE.pattern, (value or "").strip(), re.IGNORECASE))

    def _entries_missing(field):
        values = []
        values.extend(entries)
        if current:
            values.append(current)
        return [entry for entry in values if not str(entry.get(field) or "").strip()]

    def _has_prior_missing(field):
        return any(not str(entry.get(field) or "").strip() for entry in entries)

    def flush_current():
        nonlocal current
        if not current:
            return

        title = str(current.get("title") or "").strip()
        details = str(current.get("details") or "").strip()
        date = str(current.get("date") or "").strip()
        link_label = str(current.get("link_label") or "").strip()

        if not title and not details:
            current = None
            return

        entries.append({
            "title": title,
            "details": details,
            "date": date,
            "link_label": link_label,
        })
        current = None

    for line in cert_lines:
        cleaned = _clean_section_line(line)
        if not cleaned:
            continue

        url_match = CERT_URL_RE.search(cleaned)
        if url_match:
            link_value = url_match.group(1).strip().rstrip(").,;")
            if current and not str(current.get("link_label") or "").strip() and not _has_prior_missing("link_label"):
                current["link_label"] = link_value
            else:
                pending_labels.append(link_value)
            cleaned = CERT_URL_RE.sub("", cleaned).strip(" -|,;")
            if not cleaned:
                continue

        if re.fullmatch(r"certificate|credential|view\s+certificate", cleaned, re.IGNORECASE):
            label = cleaned.title()
            if current and not str(current.get("link_label") or "").strip() and not _has_prior_missing("link_label"):
                current["link_label"] = label
            else:
                pending_labels.append(label)
            continue

        if _is_date_only(cleaned):
            if current and not str(current.get("date") or "").strip() and not _has_prior_missing("date"):
                current["date"] = cleaned
            else:
                pending_dates.append(cleaned)
            continue

        if "|" in cleaned:
            parts = [part.strip() for part in cleaned.split("|") if part.strip()]
            if parts:
                flush_current()
                name = parts[0]
                details = parts[1] if len(parts) > 1 else ""
                date = parts[2] if len(parts) > 2 else ""
                link_label = parts[3] if len(parts) > 3 else ""
                if not date:
                    for part in reversed(parts[1:]):
                        if CERT_DATE_RE.search(part):
                            date = CERT_DATE_RE.search(part).group(0)
                            break
                entries.append({
                    "title": name,
                    "details": details,
                    "date": date,
                    "link_label": link_label,
                })
            continue

        trailing_date = ""
        date_match = CERT_DATE_RE.search(cleaned)
        if date_match and date_match.end() == len(cleaned):
            trailing_date = date_match.group(0).strip()
            cleaned_title = cleaned[:date_match.start()].strip(" -–|,")
        else:
            cleaned_title = cleaned

        is_detail_line = (
            len(cleaned.split()) >= 8
            or cleaned.endswith(".")
            or cleaned.lower().startswith(("completed", "earned", "achieved", "gained", "certified"))
        ) and not trailing_date

        if is_detail_line and current and not str(current.get("details") or "").strip() and not _has_prior_missing("details"):
            current["details"] = f"{current.get('details', '').strip()} {cleaned}".strip()
            continue

        if is_detail_line:
            pending_details.append(cleaned)
            continue

        flush_current()
        current = {
            "title": cleaned_title or cleaned,
            "details": "",
            "date": trailing_date,
            "link_label": "",
        }

    flush_current()

    all_entries = list(entries)

    # For columnar PDF extraction order, attach buffered details/dates/labels by entry sequence.
    missing_detail_entries = [entry for entry in all_entries if not str(entry.get("details") or "").strip()]
    for idx, detail in enumerate(pending_details):
        if idx < len(missing_detail_entries):
            missing_detail_entries[idx]["details"] = detail

    missing_date_entries = [entry for entry in all_entries if not str(entry.get("date") or "").strip()]
    for idx, date in enumerate(pending_dates):
        if idx < len(missing_date_entries):
            missing_date_entries[idx]["date"] = date

    missing_label_entries = [entry for entry in all_entries if not str(entry.get("link_label") or "").strip()]
    for idx, label in enumerate(pending_labels):
        if idx < len(missing_label_entries):
            missing_label_entries[idx]["link_label"] = label

    entries = all_entries

    certs = []
    if entries:
        for entry in entries:
            certs.append(
                " | ".join(
                    [
                        str(entry.get("title") or "").strip(),
                        str(entry.get("details") or "").strip(),
                        str(entry.get("date") or "").strip(),
                        str(entry.get("link_label") or "").strip(),
                    ]
                ).strip(" |")
            )
    else:
        certs = [
            _clean_section_line(line)
            for line in cert_lines
            if _clean_section_line(line)
        ]

    deduped = []
    seen = set()
    for cert in certs:
        key = cert.lower().strip()
        if not key or key in seen:
            continue
        seen.add(key)
        deduped.append(cert)

    return deduped


def extract_text(file_bytes):
    if file_bytes[:4] == b"%PDF":
        reader = PdfReader(io.BytesIO(file_bytes))
        text = ""

        for page in reader.pages:
            page_text = page.extract_text() or ""
            text += page_text + "\n"

        return text.strip()

    if zipfile.is_zipfile(io.BytesIO(file_bytes)):
        return _extract_docx_text(file_bytes)

    return file_bytes.decode("utf-8", errors="ignore").strip()


def extract_resume_data(text):
    if not text:
        return {
            "name": "",
            "email": "",
            "phone": "",
            "education": [],
            "projects": [],
            "experience": [],
            "certifications": [],
            "summary": ""
        }

    lines = [line.strip() for line in text.splitlines() if line.strip()]

    email_match = re.search(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", text)
    phone_match = re.search(r"(\+?\d[\d\-\s]{8,}\d)", text)

    name = ""
    for line in lines[:5]:
        if email_match and email_match.group(0) in line:
            continue
        if phone_match and phone_match.group(0) in line:
            continue
        if len(line.split()) in (2, 3, 4) and not re.search(r"\d|@|http|www", line.lower()):
            name = line
            break

    education_data = _extract_education_data(lines)

    # --- Projects and Experience Extraction ---
    section_header_patterns = {
        "projects": re.compile(r"^(projects?|project\s+work|academic\s+projects?|personal\s+projects?|portfolio)\s*[:\-]?$", re.IGNORECASE),
        "experience": re.compile(r"^(experience|work\s+experience|professional\s+experience|employment\s+history|internships?)\s*[:\-]?$", re.IGNORECASE),
    }
    stop_header_pattern = re.compile(
        r"^(summary|profile|about\s+me|education|skills?|technical\s+skills?|certifications?|achievements?|awards?|positions?\s+of\s+responsibility|languages?|interests?|hobbies|contact)\s*[:\-]?$",
        re.IGNORECASE,
    )

    def _collect_section_items(section_name):
        items = []
        in_section = False

        for raw_line in lines:
            line = raw_line.strip()
            if not line:
                continue

            if section_header_patterns[section_name].match(line):
                in_section = True
                continue

            if in_section and stop_header_pattern.match(line):
                break

            if not in_section:
                continue

            cleaned = _clean_section_line(line)
            if not cleaned:
                continue

            # Avoid accidental capture of repeated mini-headers inside section blocks.
            if section_header_patterns["projects"].match(cleaned) or section_header_patterns["experience"].match(cleaned):
                continue

            items.append({"title": cleaned, "description": ""})

        return items

    projects_data = _collect_section_items("projects")
    experience_data = _collect_section_items("experience")
    certifications_data = _extract_certifications_data(lines)

    # Fallback heuristic when explicit section headers are missing.
    if not projects_data:
        for line in lines:
            lower_line = line.lower()
            cleaned = _clean_section_line(line)
            if not cleaned:
                continue
            word_count = len(cleaned.split())
            has_project_hint = re.search(r"\b(project|portfolio)\b", lower_line)
            has_structured_shape = (
                "|" in cleaned
                or re.search(r"(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{4}$", cleaned, re.IGNORECASE)
            )
            looks_like_paragraph = word_count > 14 or bool(re.search(r"[.!?]", cleaned))
            if has_project_hint and (has_structured_shape or not looks_like_paragraph):
                projects_data.append({"title": cleaned, "description": ""})

    # --- Summary Extraction ---
    summary_keywords = ["summary", "profile", "about me"]
    summary = ""
    for i, line in enumerate(lines):
        if any(keyword in line.lower() for keyword in summary_keywords):
            # Take the next few lines as summary
            summary = " ".join(lines[i+1:i+5])[:500]
            break

    return {
        "name": name,
        "email": email_match.group(0) if email_match else "",
        "phone": phone_match.group(0) if phone_match else "",
        "education": education_data,
        "projects": projects_data,
        "experience": experience_data,
        "certifications": certifications_data,
        "summary": summary
    }
