import re
from pathlib import Path

root = Path(r"c:\ResumePro\frontend\webapp")
index_path = root / "index.html"

shell = index_path.read_text(encoding="utf-8")

# Keep everything up to the main container and everything after it.
start_match = re.search(r'(<!DOCTYPE html>[\s\S]*?<div class="main">)', shell)
end_match = re.search(r'(</div><!-- /main -->[\s\S]*?</html>)', shell)
if not start_match or not end_match:
    raise RuntimeError("Could not find shell boundaries in index.html")

head_shell = start_match.group(1)
foot_shell = end_match.group(1)

# Remove any redirect remnants from the head shell.
head_shell = re.sub(r'\s*<meta http-equiv="refresh" content="0; url=dashboard\.html">\s*', '\n', head_shell)
head_shell = re.sub(r'\s*<script>\s*if \(!window\.location\.pathname\.toLowerCase\(\)\.endsWith\(\'dashboard\.html\'\)\) \{\s*window\.location\.replace\(\'dashboard\.html\'\);\s*\}\s*</script>\s*', '\n', head_shell)

page_files = [
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

blocks = []
for filename, page_id, active in page_files:
    file_text = (root / filename).read_text(encoding="utf-8")
    main_match = re.search(r'<div class="main">([\s\S]*?)</div><!-- /main -->', file_text)
    if not main_match:
        raise RuntimeError(f"Could not find main content in {filename}")
    page_match = re.search(rf'<div id="{re.escape(page_id)}"[\s\S]*?</div>\s*</div>\s*$', main_match.group(1).strip(), re.DOTALL)
    if page_match:
        page_block = page_match.group(0)
    else:
        # Fallback: find the page block by its id and a balanced closing for the immediate page section.
        start = main_match.group(1).find(f'id="{page_id}"')
        if start == -1:
            raise RuntimeError(f"Could not find page block for {page_id} in {filename}")
        div_start = main_match.group(1).rfind('<div', 0, start)
        page_block = main_match.group(1)[div_start:].strip()
        # Trim any trailing close/main markup.
        page_block = re.sub(r'</div><!-- /main -->\s*$', '', page_block).strip()

    # Normalize class for the combined base page.
    if active:
        page_block = re.sub(r'class="page[^\"]*"', 'class="page active fade-in"', page_block, count=1)
    else:
        page_block = re.sub(r'class="page[^\"]*"', 'class="page fade-in"', page_block, count=1)

    blocks.append(page_block)

main_html = '\n\n'.join(blocks)
rebuilt = head_shell + '\n' + main_html + '\n' + foot_shell

# Ensure root loads the base page, not a redirect.
rebuilt = rebuilt.replace('script.js?v=20260414ah', 'script.js?v=20260414ai')
rebuilt = rebuilt.replace('script.js?v=20260414ag', 'script.js?v=20260414ai')

index_path.write_text(rebuilt, encoding="utf-8")
print('Rebuilt index.html with all page sections')
print(f'Bytes: {len(rebuilt)}')
