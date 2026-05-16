Deployment instructions for ad integration

Summary
- Files changed in this repo:
  - frontend/webapp/script.js

Goal
- Commit these changes and deploy the updated `frontend/webapp` files to your live site (https://resumepro2.me/).

Recommended workflow A (GitHub Pages or git-based deploy)
1. From repo root, review changes:

   git status
   git diff --name-only

2. Stage and commit the changes:

   git add frontend/webapp/script.js
   git commit -m "Add ad helpers + interstitials; inject ad slots on dashboard/analyzer/explorer"

3. Push to the branch you publish from (example: `main`):

   git push origin main

4. Verify GitHub Pages (if used) or your deployment pipeline refreshes the site. If the site uses a special branch (e.g. `gh-pages`) push there instead.

Manual deploy (if site is hosted on a server without git access)
1. Create a zip of the webapp folder (PowerShell example):

   cd frontend\webapp
   Compress-Archive -Path * -DestinationPath ..\..\resumepro-webapp.zip -Force

2. Upload the zip to your host and extract it into the public web root that serves https://resumepro2.me/ (backup the existing files first).

3. Restart any web server or CDN cache as necessary.

Quick local smoke test
1. Serve the webapp locally and open in browser:

   cd frontend/webapp
   python -m http.server 8000
   # Open http://localhost:8000/resume%20analyzer.html

2. Test flows:
- Register or login -> confirm interstitial appears after login.
- Upload or drag-drop a resume -> confirm interstitial appears before upload starts.
- Visit Dashboard and Explorer pages to confirm inline ad slots rendered.

Troubleshooting / Rollback
- If deployment fails or ads break functionality, revert the commit:

   git revert <commit-sha>
   git push origin main

Security & Policy notes
- Ads are inserted as a simple banner that links to the existing sponsor URL found in the repo. Verify the ad provider and link are acceptable for your site.

If you want, I can:
- Produce a zip of `frontend/webapp` now and place it at `deploy/resumepro-webapp.zip` for download.
- Create a dedicated patch file (git diff) in `deploy/changes.patch`.
- Make any changes to ad placement or provider before you deploy.
