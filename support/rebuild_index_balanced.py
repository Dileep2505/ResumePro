import re
from pathlib import Path

root = Path(r"c:\ResumePro\frontend\webapp")
index_path = root / "index.html"
current = index_path.read_text(encoding="utf-8")

start_match = re.search(r'(<!DOCTYPE html>[\s\S]*?<div class="main">)', current)
end_match = re.search(r'(</div><!-- /main -->[\s\S]*?</html>)', current)
if not start_match or not end_match:
    raise RuntimeError("Could not find index shell boundaries")

head = start_match.group(1)
foot = end_match.group(1)
head = re.sub(r'\s*<meta http-equiv="refresh" content="0; url=dashboard\.html">\s*', '\n', head)
head = re.sub(r'\s*<script>\s*if \(!window\.location\.pathname\.toLowerCase\(\)\.endsWith\(\'dashboard\.html\'\)\) \{\s*window\.location\.replace\(\'dashboard\.html\'\);\s*\}\s*</script>\s*', '\n', head)

pages = [
    ("dashboard.html", "page-dashboard", True),
    ("profile.html", "page-profile", False),
    ("resume analyzer.html", "page-analyzer", False),
    ("career explorer.html", "page-explorer", False),
    ("market trends.html", "page-market", False),
    ("create resume.html", "page-create", False),
    ("jd optimize.html", "page-builder", False),
    ("jobs for you.html", "page-learning", False),
    ("setting.html", "page-settings", False),
]

def extract_page_block(text: str, page_id: str) -> str:
    start_marker = f'id="{page_id}"'
    start_idx = text.find(start_marker)
    if start_idx == -1:
        raise RuntimeError(f"Missing page id {page_id}")

    div_start = text.rfind('<div', 0, start_idx)
    if div_start == -1:
        raise RuntimeError(f"Could not locate opening div for {page_id}")

    i = div_start
    depth = 0
    while i < len(text):
        next_open = text.find('<div', i)
        next_close = text.find('</div>', i)
        if next_close == -1:
            raise RuntimeError(f"Unclosed div structure for {page_id}")

        if next_open != -1 and next_open < next_close:
            depth += 1
            i = next_open + 4
        else:
            depth -= 1
            i = next_close + 6
            if depth == 0:
                return text[div_start:i].rstrip()

    raise RuntimeError(f"Could not balance divs for {page_id}")

blocks = []
for filename, page_id, active in pages:
    text = (root / filename).read_text(encoding="utf-8")
    main_match = re.search(r'<div class="main">([\s\S]*?)</div><!-- /main -->', text)
    if not main_match:
        raise RuntimeError(f"Could not locate main section in {filename}")
    block = extract_page_block(main_match.group(1), page_id)
    block = re.sub(r'class="page[^\"]*"', 'class="page active fade-in"' if active else 'class="page fade-in"', block, count=1)
    blocks.append(block)

rebuilt = head + '\n' + '\n\n'.join(blocks) + '\n  ' + foot
rebuilt = rebuilt.replace('script.js?v=20260414ah', 'script.js?v=20260414ai')
index_path.write_text(rebuilt, encoding="utf-8")
print(f"Rebuilt index.html with {len(blocks)} page blocks")
print(f"Bytes: {len(rebuilt)}")
