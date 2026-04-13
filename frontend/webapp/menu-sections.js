function getMenuTargetFile(pageId) {
  const pageMap = {
    dashboard: 'dashboard.html',
    analyzer: 'resume analyzer.html',
    explorer: 'career explorer.html',
    market: 'market trends.html',
    create: 'create resume.html',
    builder: 'jd optimize.html',
    learning: 'jobs for you.html',
    settings: 'setting.html',
    profile: 'profile.html',
  };
  return pageMap[String(pageId || '').toLowerCase()] || '';
}

function navigateMenuPage(pageId, tabId = '') {
  const targetFile = getMenuTargetFile(pageId);
  if (!targetFile) return;

  if (tabId) {
    try {
      sessionStorage.setItem('resumepro_pending_tab', JSON.stringify({ pageId, tabId }));
    } catch (_) {
      // Ignore storage errors and continue navigation.
    }
  }

  const currentFile = decodeURIComponent((window.location.pathname || '').split('/').pop() || '').toLowerCase();
  if (currentFile === targetFile.toLowerCase()) {
    if (typeof showPage === 'function') showPage(pageId);
    if (tabId && typeof switchTab === 'function') switchTab(tabId);
    return;
  }

  window.location.href = targetFile;
}

class ResumeProSidebarMenu extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <nav class="nav">
        <section class="nav-section" data-menu-section="analysis">
          <div class="nav-label">Analysis</div>

          <div class="nav-item active" data-page="dashboard" onclick="navigateMenuPage('dashboard')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
              <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
            </svg>
            <span>Dashboard</span>
          </div>

          <div class="nav-item" data-page="analyzer" onclick="navigateMenuPage('analyzer')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <span>ATS Checker</span>
            <span class="nav-badge">ATS</span>
          </div>

          <div class="nav-item" data-page="explorer" onclick="navigateMenuPage('explorer')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
              <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
            <span>Resume Analyzer</span>
          </div>
        </section>

        <section class="nav-section" data-menu-section="career">
          <div class="nav-label">Career</div>

          <div class="nav-item" data-page="learning" onclick="navigateMenuPage('learning')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/>
              <path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/>
            </svg>
            <span>Jobs for You</span>
          </div>

          <div class="nav-item" data-page="market" onclick="navigateMenuPage('market')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
            <span>Market Trends</span>
          </div>
        </section>

        <section class="nav-section" data-menu-section="tools">
          <div class="nav-label">Tools</div>

          <div class="nav-item" data-page="create" onclick="navigateMenuPage('create', 'build')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 5v14M5 12h14"/>
              <circle cx="12" cy="12" r="10"/>
            </svg>
            <span>Create Resume</span>
          </div>

          <div class="nav-item" data-page="builder" onclick="navigateMenuPage('builder', 'optimize')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14.5 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7.5L14.5 2z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
            <span>JD Optimize</span>
          </div>

        </section>

        <div id="history-dropdown" class="history-dropdown">
          <div class="history-loading">Loading history...</div>
        </div>
      </nav>
    `;
  }
}

if (!customElements.get("resumepro-sidebar-menu")) {
  customElements.define("resumepro-sidebar-menu", ResumeProSidebarMenu);
}
