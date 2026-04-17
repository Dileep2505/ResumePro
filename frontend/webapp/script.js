let scoreChart;
let isUploading = false;
let lastUploadSignature = "";
let lastUploadAt = 0;
const AUTH_USERS_KEY = "resumepro_users";
const AUTH_SESSION_KEY = "resumepro_session";
const AUTH_PROFILE_KEY_PREFIX = "resumepro_profile_";
const AUTH_RESET_TOKENS_KEY = "resumepro_reset_tokens";
const APP_STATE_KEY_PREFIX = "resumepro_app_state_";
const RESUMEPRO_CONFIG = window.RESUMEPRO_CONFIG || {};
const BACKEND_BASE_URL = "https://resumepro-lp2a.onrender.com";
const RESUME_TEMPLATES = ["jonathan", "robert", "firstlast", "omar"];
const SOFTWARE_SKILL_CATEGORIES = [
  {
    title: "Frontend",
    skills: ["HTML", "CSS", "JavaScript", "TypeScript", "React", "Next.js", "Vue.js", "Angular", "Tailwind CSS", "Bootstrap"]
  },
  {
    title: "Backend",
    skills: ["Node.js", "Express.js", "Python", "Django", "Flask", "FastAPI", "Java", "Spring Boot", "PHP", "Laravel", "REST APIs", "GraphQL"]
  },
  {
    title: "Databases",
    skills: ["MySQL", "PostgreSQL", "MongoDB", "SQLite", "Redis", "Firebase", "SQL"]
  },
  {
    title: "DevOps & Cloud",
    skills: ["Git", "GitHub", "Docker", "Kubernetes", "AWS", "Azure", "Google Cloud", "Linux", "CI/CD"]
  },
  {
    title: "Testing",
    skills: ["Jest", "Mocha", "PyTest", "Selenium", "Cypress", "Playwright", "Postman"]
  },
  {
    title: "Data & Analytics",
    skills: ["Excel", "Power BI", "Tableau", "Pandas", "NumPy", "Matplotlib", "Data Analysis"]
  },
  {
    title: "Mobile",
    skills: ["React Native", "Flutter", "Android", "iOS"]
  },
  {
    title: "Engineering Basics",
    skills: ["Data Structures", "Algorithms", "OOP", "System Design", "Agile", "Scrum", "Jira", "Figma"]
  }
];
const appState = {
  skills: [],
  resume_data: {},
  generated_resume: null,
  profile: {},
  current_page: "dashboard",
  ai_context: { page: "dashboard", fieldId: "", updatedAt: 0 },
  ai_assistant_open: false,
  ai_assistant_position: { right: 18, bottom: 18 },
  resume_template: "jonathan",
  raw_text: "",
  ats_view: "detailed",
  ats_data: null,
  base_ats_data: null,
  ai_rewrite: null,
  job_data: { matches: [] },
  opt_data: { optimized_skills: [], added_keywords: [], suggestions: [] },
  career_data: { eligible: [], nearly_eligible: [], not_ready: [] }
};
let projectEditIndex = -1;
let educationEditIndex = -1;
let experienceEditIndex = -1;
let certificationEditIndex = -1;
let achievementEditIndex = -1;

// Google OAuth Configuration
// Get your Client ID from: https://console.cloud.google.com/
// See GOOGLE_OAUTH_SETUP.md for detailed instructions
// Example format: const GOOGLE_CLIENT_ID = "123456789-abcdefghijk.apps.googleusercontent.com";
const GOOGLE_CLIENT_ID = RESUMEPRO_CONFIG.googleClientId || "YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com"; // REPLACE with your real Client ID from Google Cloud
const GOOGLE_ALLOWED_ORIGINS = RESUMEPRO_CONFIG.googleAllowedOrigins || [
  "http://127.0.0.1:8000",
  "http://localhost:8000",
  "http://localhost:3000"
];
const GOOGLE_PREFERRED_ORIGIN = RESUMEPRO_CONFIG.googlePreferredOrigin || "http://127.0.0.1:8000";
let googleInitStarted = false;
let googleInitCompleted = false;
let googleInitRetryTimer = null;
let googleSdkLoadListenerAttached = false;

function redirectToPreferredGoogleOriginIfNeeded() {
  const currentOrigin = window.location.origin;
  if (!GOOGLE_PREFERRED_ORIGIN || currentOrigin === GOOGLE_PREFERRED_ORIGIN) {
    return false;
  }
  const localFrontendOrigins = [
    "http://127.0.0.1:3000",
    "http://localhost:3000",
    "http://127.0.0.1:5501",
    "http://localhost:5501",
    "http://127.0.0.1:8000",
    "http://localhost:8000",
    "http://127.0.0.1:8001",
    "http://localhost:8001"
  ];
  if (localFrontendOrigins.includes(currentOrigin) && localFrontendOrigins.includes(GOOGLE_PREFERRED_ORIGIN)) {
    const nextUrl = `${GOOGLE_PREFERRED_ORIGIN}${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.location.replace(nextUrl);
    return true;
  }
  return false;
}

function normalizeList(items) {
  return (items || [])
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (item && typeof item === "object") {
        return item.raw || item.title || item.degree || item.institution || item.description || "";
      }
      return String(item || "").trim();
    })
    .filter(Boolean);
}

function parseProjectHeaderLine(line) {
  const source = String(line || "").replace(/\s+/g, " ").trim();
  if (!source) return null;

  const dateMatch = source.match(/(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{4}$/i);
  const date = dateMatch ? dateMatch[0] : "";
  const withoutDate = date ? source.slice(0, -date.length).trim().replace(/[|\-–]+\s*$/, "").trim() : source;

  let title = withoutDate;
  let tech = "";
  if (withoutDate.includes("|")) {
    const parts = withoutDate.split("|");
    title = (parts.shift() || "").trim();
    tech = parts.join("|").trim();
  }

  return { title: title || withoutDate, tech, date };
}

function parseStructuredProjects(rawText, fallbackProjects = []) {
  const lines = String(rawText || "")
    .split(/\r?\n/)
    .map((line) => String(line || "").trim())
    .filter(Boolean);

  const projectsHeaderRegex = /^(projects?|project\s+work|academic\s+projects?|personal\s+projects?|portfolio)\s*:?$/i;
  const stopHeaderRegex = /^(experience|work\s+experience|education|skills?|technical\s+skills?|summary|profile|certifications?|achievements?|awards?|languages?|contact)\s*:?$/i;
  const bulletRegex = /^[\u2022\-*·]\s*/;

  let startIndex = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (projectsHeaderRegex.test(lines[i])) {
      startIndex = i + 1;
      break;
    }
  }

  const sectionLines = [];
  if (startIndex >= 0) {
    for (let i = startIndex; i < lines.length; i += 1) {
      const line = lines[i];
      if (stopHeaderRegex.test(line)) break;
      sectionLines.push(line);
    }
  }

  const fallbackLines = normalizeList(fallbackProjects).filter((line) => String(line || "").trim());
  const candidateLines = (() => {
    const combined = sectionLines.length ? [...sectionLines, ...fallbackLines] : fallbackLines;
    const seen = new Set();
    return combined.filter((line) => {
      const key = String(line || "").trim().toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  })();

  const projects = [];
  let current = null;

  const isLikelyProjectHeader = (line) => {
    const raw = String(line || "").trim();
    if (!raw) return false;

    const parsed = parseProjectHeaderLine(raw);
    if (parsed?.date) return true;
    if (!raw.includes("|")) return false;

    const parts = raw.split("|").map((part) => part.trim()).filter(Boolean);
    if (!parts.length) return false;

    const left = parts[0] || "";
    const right = parts.slice(1).join(" | ");
    const leftWords = left.split(/\s+/).filter(Boolean).length;
    const leftLooksTitle = leftWords <= 8 && left.length <= 60;
    const rightLooksMeta = right.length <= 50 && !/[.!?]{2,}/.test(right);

    return leftLooksTitle && rightLooksMeta;
  };

  const isLikelySentenceDetail = (line) => {
    const raw = String(line || "").trim();
    if (!raw) return false;
    if (bulletRegex.test(raw)) return false;

    const wordCount = raw.split(/\s+/).filter(Boolean).length;
    const hasTerminalPunctuation = /[.!?]$/.test(raw);
    const hasComma = raw.includes(",");
    const hasPipeOrDate = raw.includes("|") || !!parseProjectHeaderLine(raw)?.date;

    if (hasPipeOrDate) return false;
    return wordCount >= 9 || hasTerminalPunctuation || hasComma;
  };

  const appendToCurrentBullet = (text, options = {}) => {
    const { splitByDefault = false } = options;
    if (!current) {
      current = { title: "Project", tech: "", date: "", bullets: [] };
      projects.push(current);
    }
    const cleanText = String(text || "").trim().replace(/^[-*\u2022·]\s*/, "");
    if (!cleanText) return;

    if (!current.bullets.length) {
      current.bullets.push(cleanText);
      return;
    }

    if (splitByDefault) {
      const lastBullet = String(current.bullets[current.bullets.length - 1] || "").trim();
      const looksContinuation = !/[.!?]$/.test(lastBullet)
        && /^[a-z(]/.test(cleanText)
        && cleanText.split(/\s+/).filter(Boolean).length <= 8;

      if (!looksContinuation) {
        current.bullets.push(cleanText);
        return;
      }
    }

    const lastIndex = current.bullets.length - 1;
    current.bullets[lastIndex] = `${current.bullets[lastIndex]} ${cleanText}`.replace(/\s+/g, " ").trim();
  };

  candidateLines.forEach((line) => {
    const raw = String(line || "").trim();
    if (!raw) return;

    if (bulletRegex.test(raw)) {
      const bullet = raw.replace(bulletRegex, "").trim();
      if (!bullet) return;
      if (!current) {
        current = { title: "Project", tech: "", date: "", bullets: [] };
        projects.push(current);
      }
      current.bullets.push(bullet);
      return;
    }

    if (isLikelySentenceDetail(raw)) {
      appendToCurrentBullet(raw, { splitByDefault: true });
      return;
    }

    const parsed = parseProjectHeaderLine(raw);
    if (!parsed || !parsed.title) return;

    if (isLikelyProjectHeader(raw)) {
      current = { title: parsed.title, tech: parsed.tech, date: parsed.date, bullets: [] };
      projects.push(current);
      return;
    }

    appendToCurrentBullet(raw);
  });

  return projects.filter((item) => (item.title || "").trim());
}

function extractCertificationsFromRawText(rawText = "") {
  const lines = String(rawText || "")
    .split(/\r?\n/)
    .map((line) => String(line || "").trim())
    .filter(Boolean);

  if (!lines.length) return [];

  const certHeaderRegex = /^(certifications?|licenses?|licenses?\s+and\s+certifications?|professional\s+certifications?)\s*:?$/i;
  const stopHeaderRegex = /^(experience|work\s+experience|education|skills?|technical\s+skills?|summary|profile|projects?|achievements?|awards?|languages?|contact|interests?|hobbies)\s*:?$/i;
  const certKeywordRegex = /\b(certified|certification|certificate|license|licensed|pmp|cissp|aws\s+certified|azure\s+certified|google\s+cloud\s+certified|scrum\s+master|itil|comptia|oracle\s+certified|salesforce\s+certified)\b/i;

  const sectionLines = [];
  let inCertSection = false;

  for (const line of lines) {
    if (certHeaderRegex.test(line)) {
      inCertSection = true;
      continue;
    }
    if (inCertSection && stopHeaderRegex.test(line)) break;
    if (inCertSection) sectionLines.push(line);
  }

  const fallbackLines = lines.filter((line) => certKeywordRegex.test(line));
  const sourceLines = sectionLines.length ? sectionLines : fallbackLines;
  const certDateRegex = /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{4}\b|\b(?:19|20)\d{2}\b/i;
  const rows = [];
  let current = null;

  const flushCurrent = () => {
    if (!current) return;
    rows.push([current.name, current.details, current.date].filter(Boolean).join(" | ").trim());
    current = null;
  };

  sourceLines.forEach((line) => {
    const clean = String(line || "").replace(/^[\u2022\-*\s\d.)]+/, "").trim();
    if (!clean) return;

    if (/^(certificate|credential|view\s+certificate)$/i.test(clean)) {
      return;
    }

    if (clean.includes("|")) {
      const parts = clean.split("|").map((part) => part.trim()).filter(Boolean);
      if (!parts.length) return;
      flushCurrent();
      const name = parts[0] || "";
      const details = parts[1] || "";
      const date = parts[2] || "";
      rows.push([name, details, date].filter(Boolean).join(" | ").trim());
      return;
    }

    const trailingDateMatch = clean.match(new RegExp(`${certDateRegex.source}$`, "i"));
    const hasTrailingDate = !!trailingDateMatch;

    if (hasTrailingDate) {
      flushCurrent();
      const date = trailingDateMatch ? trailingDateMatch[0].trim() : "";
      const name = clean.replace(new RegExp(`${certDateRegex.source}$`, "i"), "").replace(/[\s|,\-–]+$/, "").trim();
      current = { name: name || clean, details: "", date };
      return;
    }

    const looksDetail = clean.length > 40 || /[.!?]$/.test(clean) || /^(completed|earned|gained|achieved|trained)/i.test(clean);
    if (looksDetail && current) {
      current.details = `${current.details} ${clean}`.trim();
      return;
    }

    flushCurrent();
    current = { name: clean, details: "", date: "" };
  });

  flushCurrent();
  return normalizeCertificationInputLines(rows);
}

function normalizeProjectItems(items) {
  return (items || [])
    .map((item) => {
      if (typeof item === "string") {
        const parsed = parseProjectHeaderLine(item);
        return { title: parsed?.title || item.trim(), tech: parsed?.tech || "", date: parsed?.date || "", bullets: [] };
      }

      if (!item || typeof item !== "object") return null;

      const raw = String(item.raw || item.title || item.name || item.description || "").replace(/\s+/g, " ").trim();
      const headerSource = String(item.title || item.name || raw || "").trim();
      const parsed = parseProjectHeaderLine(headerSource);
      const title = String(item.title || item.name || parsed?.title || raw || "Project").trim();
      const tech = Array.isArray(item.tech)
        ? item.tech.map((entry) => String(entry || "").trim()).filter(Boolean).join(", ")
        : String(item.tech || item.stack || parsed?.tech || "").replace(/\s+/g, " ").trim();
      const date = String(item.date || item.duration || parsed?.date || "").replace(/\s+/g, " ").trim();
      const descriptionLines = Array.isArray(item.bullets)
        ? item.bullets
        : String(item.description || item.details || raw || "").split(/\r?\n+/).map((line) => line.trim()).filter(Boolean);
      const bullets = uniqueNormalizedLines(descriptionLines).map((line) => line.replace(/^[-*•·]\s*/, "").trim()).filter(Boolean);

      return { title, tech, date, bullets };
    })
    .filter((item) => item && (item.title || item.tech || item.date || (item.bullets || []).length));
}

function getStructuredProjectsFromSource(source, rawText = "") {
  const items = Array.isArray(source) ? source : [];
  if (!items.length) {
    return parseStructuredProjects(rawText || "", []);
  }

  const hasOnlyObjects = items.every((item) => item && typeof item === "object" && !Array.isArray(item));
  const normalizedLines = hasOnlyObjects
    ? projectsToEditableLines(normalizeProjectItems(items))
    : normalizeList(items);

  return parseStructuredProjects("", normalizeProjectInputLinesStrict(normalizedLines));
}

function buildProjectFromInputs() {
  const title = getInputValue("builder-project-title");
  const tech = getInputValue("builder-project-tech");
  const date = getInputValue("builder-project-date");
  const bullets = String(document.getElementById("builder-project-bullets")?.value || "")
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => (line.startsWith("-") ? line.slice(1).trim() : line));

  return { title, tech, date, bullets };
}

function projectsToEditableLines(projects) {
  return (projects || []).flatMap((project) => {
    const header = [project.title || "Project", project.tech ? `| ${project.tech}` : "", project.date || ""]
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    const bullets = (project.bullets || []).map((bullet) => `- ${bullet}`.trim());
    return [header, ...bullets].filter(Boolean);
  });
}

function dedupeStructuredProjects(projects) {
  const list = Array.isArray(projects) ? projects : [];
  const seen = new Set();
  return list.filter((project) => {
    const title = String(project?.title || "").trim().toLowerCase();
    const tech = String(project?.tech || "").trim().toLowerCase();
    const date = String(project?.date || "").trim().toLowerCase();
    const bullets = (project?.bullets || [])
      .map((bullet) => String(bullet || "").trim().toLowerCase())
      .filter(Boolean)
      .join("||");
    const key = `${title}__${tech}__${date}__${bullets}`;
    if (!title && !tech && !date && !bullets) return false;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function renderStructuredProjectCards(projects, emptyLabel = "", options = {}) {
  const { enableDelete = false, enableEdit = false } = options;
  const projectList = dedupeStructuredProjects(projects);
  if (!projectList.length) {
    return emptyLabel ? `<div style="background:var(--surface2);border-radius:10px;padding:10px 12px;color:var(--text3);font-size:13px;">${escapeHtml(emptyLabel)}</div>` : "";
  }

  return projectList.map((project, index) => {
    const headLeft = [
      `<span class="project-line-title">${escapeHtml(project.title || "Project")}</span>`,
      project.tech ? `<span class="project-line-sep">|</span><span class="project-line-tech">${escapeHtml(project.tech)}</span>` : "",
    ].join("");

    const deleteButton = enableDelete
      ? `<button type="button" class="btn btn-ghost" style="padding:4px 8px;font-size:11px;line-height:1.2;" onclick="deleteProjectAt(${index})">Delete</button>`
      : "";

    const editButton = enableEdit
      ? `<button type="button" class="btn btn-ghost" style="padding:4px 8px;font-size:11px;line-height:1.2;" onclick="editProjectAt(${index})">Edit</button>`
      : "";

    const bullets = (project.bullets || []).length
      ? `<ul class="project-bullets">${project.bullets.map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join("")}</ul>`
      : "";

    return `
      <div class="project-structured-card">
        <div class="project-structured-head">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;">
            <div style="font-size:13px;font-weight:500;margin-bottom:4px;" data-project-header="true">${headLeft}</div>
            <div style="display:flex;gap:6px;align-items:center;">${editButton}${deleteButton}</div>
          </div>
          <div class="project-line-date">${escapeHtml(project.date || "")}</div>
        </div>
        ${bullets}
      </div>`;
  }).join("");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function firstName(fullName) {
  return (fullName || "").trim().split(/\s+/)[0] || "";
}

/**
 * Makes a JSON request (GET if no payload, POST if payload, or override method).
 * @param {string} url - The endpoint URL
 * @param {object|null} payload - Data to send (for POST/PUT), or null for GET
 * @param {string} [method] - Optional explicit method (GET, POST, PUT, etc)
 */
async function postJson(url, payload = null, method = undefined) {
  let fetchOptions = {
    headers: { "Content-Type": "application/json" }
  };
  if (method) {
    fetchOptions.method = method.toUpperCase();
  } else if (payload) {
    fetchOptions.method = "POST";
  } else {
    fetchOptions.method = "GET";
  }
  if (payload && fetchOptions.method !== "GET") {
    fetchOptions.body = JSON.stringify(payload);
  }
  const response = await fetch(url, fetchOptions);
  if (!response.ok) {
    throw new Error(`${url} failed with status ${response.status}`);
  }
  return response.json();
}

async function postJsonAllowStatus(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  let data = {};
  try {
    data = await response.json();
  } catch {
    data = {};
  }

  return { ok: response.ok, status: response.status, data };
}

async function upsertBackendUser(user) {
  try {
    await postJson(`${BACKEND_BASE_URL}/users/upsert`, {
      name: user.name,
      email: user.email,
      provider: user.provider || "local",
    });
  } catch (error) {
    console.warn("Could not sync user to backend:", error.message || error);
  }
}

async function logUserSearch(queryText, searchType, resultCount) {
  const session = getStoredSession();
  if (!session?.email) return;

  try {
    if (session.email) {
      await fetch(`${BACKEND_BASE_URL}/users/${encodeURIComponent(session.email)}/searches?limit=1`);
    }
    updateSidebarSearchHistory();
  } catch (error) {
    console.warn("Could not log search to backend:", error.message || error);
  }
}

function getStoredUsers() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_USERS_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveStoredUsers(users) {
  localStorage.setItem(AUTH_USERS_KEY, JSON.stringify(users));
}

function getStoredSession() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_SESSION_KEY) || "null");
  } catch {
    return null;
  }
}

function saveSession(user) {
  localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(user));
}

function clearSession() {
  localStorage.removeItem(AUTH_SESSION_KEY);
}

function appStateStorageKey() {
  const session = getStoredSession();
  const email = String(session?.email || "guest").trim().toLowerCase();
  return `${APP_STATE_KEY_PREFIX}${email}`;
}

function savePersistentAppState() {
  const session = getStoredSession();
  if (!session?.email) return;

  const payload = {
    current_page: appState.current_page || "dashboard",
    ai_context: appState.ai_context || { page: appState.current_page || "dashboard", fieldId: "", updatedAt: Date.now() },
    ai_assistant_open: Boolean(appState.ai_assistant_open),
    ai_assistant_position: appState.ai_assistant_position || { right: 18, bottom: 18 },
    resume_template: RESUME_TEMPLATES.includes(appState.resume_template) ? appState.resume_template : "jonathan",
    skills: appState.skills || [],
    resume_data: appState.resume_data || {},
    generated_resume: appState.generated_resume || null,
    raw_text: appState.raw_text || "",
    ats_view: appState.ats_view || "detailed",
    ats_data: appState.ats_data || null,
    base_ats_data: appState.base_ats_data || null,
    ai_rewrite: appState.ai_rewrite || null,
    job_data: appState.job_data || { matches: [] },
    opt_data: appState.opt_data || { optimized_skills: [], added_keywords: [], suggestions: [] },
    career_data: appState.career_data || { eligible: [], nearly_eligible: [], not_ready: [] },
    upload_status: document.getElementById("upload-status")?.textContent || "",
    upload_button: document.getElementById("upload-another-btn")?.textContent || "Browse files",
    uploaded_file_name: document.getElementById("uploaded-file-name")?.textContent || "None",
  };

  localStorage.setItem(appStateStorageKey(), JSON.stringify(payload));
}

function loadPersistentAppState() {
  const session = getStoredSession();
  if (!session?.email) return null;

  try {
    const data = JSON.parse(localStorage.getItem(appStateStorageKey()) || "null");
    return data && typeof data === "object" ? data : null;
  } catch {
    return null;
  }
}

function clearPersistentAppState() {
  localStorage.removeItem(appStateStorageKey());
}

// ════════════════ SEARCH HISTORY DROPDOWN ════════════════

async function toggleHistoryDropdown(event) {
  event.stopPropagation();
  const trigger = event.currentTarget;
  const dropdown = document.getElementById("history-dropdown");
  
  const isOpen = dropdown.classList.contains("open");
  
  if (isOpen) {
    dropdown.classList.remove("open");
    trigger.classList.remove("open");
  } else {
    // Fetch and display history
    trigger.classList.add("open");
    dropdown.classList.add("open");
    await loadSearchHistory();
  }
}

async function loadSearchHistory() {
  const dropdown = document.getElementById("history-dropdown");
  if (!dropdown) return;

  const session = getStoredSession();
  if (!session?.email) {
    showHistoryEmpty("Please log in to view search history");
    return;
  }

  dropdown.innerHTML = '<div class="history-loading">Loading history...</div>';

  try {
    const searches = await fetchUserSearchHistory(20);
    if (!searches || searches.length === 0) {
      dropdown.innerHTML = "";
      return;
    }
    // Render history items (limit to 20)
    const items = searches.slice(0, 20).map((search) => {
      const date = new Date(search.created_at);
      const timeStr = date.toLocaleDateString() + " " + date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      const type = String(search.search_type || "search");
      const isResumeUpload = type === "resume_upload";
      const resultLine = isResumeUpload
        ? `ATS Score: ${search.result_count ?? 0}`
        : `${formatSearchType(type)} • ${search.result_count} results`;
      return `
        <div class="history-item" onclick="replaySearch('${search.query_text.replace(/'/g, "\\'")}', '${search.search_type}')">
          <div class="history-item-left">
            <div class="history-item-query" title="${search.query_text.substring(0, 50)}">${search.query_text.substring(0, 50)}</div>
            <div class="history-item-type">${resultLine}</div>
          </div>
          <div class="history-item-date">${timeStr}</div>
        </div>
      `;
    }).join("");
    dropdown.innerHTML = items;
  } catch (error) {
    console.warn("Error loading search history:", error);
    dropdown.innerHTML = "";
  }
}

function showHistoryEmpty(message) {
  const dropdown = document.getElementById("history-dropdown");
  if (!dropdown) return;
  dropdown.innerHTML = `<div class="history-empty">${message}</div>`;
}

async function fetchUserSearchHistory(limit = 20) {
  const session = getStoredSession();
  if (!session?.email) return [];

  try {
    const response = await fetch(`${BACKEND_BASE_URL}/users/${encodeURIComponent(session.email)}/searches?limit=${limit}`);
    if (response.status === 404) {
      // User not found, treat as no history, do not log
      return [];
    }
    if (!response.ok) {
      // For other errors, optionally log, but suppress for 404
      return [];
    }
    const data = await response.json();
    return Array.isArray(data.searches) ? data.searches : [];
  } catch (err) {
    // Suppress all errors for this call (including network errors)
    return [];
  }
}

function providerLabel(provider) {
  const value = String(provider || "local").toLowerCase();
  if (value === "google") return "Google OAuth";
  if (value === "local") return "Email Login";
  return `${value.charAt(0).toUpperCase()}${value.slice(1)} Login`;
}

function formatShortDate(input) {
  if (!input) return "";
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatSearchType(input) {
  return String(input || "search").replace(/_/g, " ");
}

function toggleSidebarProfileCard(event) {
  if (event) event.stopPropagation();
  const card = document.getElementById("sidebar-user-card");
  if (!card) return;

  const compactView = window.matchMedia("(max-width: 900px)").matches;
  if (compactView) {
    card.classList.toggle("expanded");
    return;
  }

  // On larger screens, clicking profile area takes user directly to profile details page.
  if (typeof showPage === "function") {
    showPage("profile");
    window.scrollTo({ top: 0, behavior: "instant" });
  }
}

function renderSidebarLink(id, value) {
  const el = document.getElementById(id);
  if (!el) return;

  const raw = String(value || "").trim();
  if (!raw) {
    el.href = "#";
    el.textContent = "Not set";
    return;
  }

  const normalized = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const parsed = new URL(normalized);
    el.href = parsed.href;
    el.textContent = "Open";
  } catch {
    el.href = "#";
    el.textContent = "Invalid";
  }
}

async function updateSidebarSearchHistory() {
  const list = document.getElementById("sidebar-history-list");
  const count = document.getElementById("sidebar-history-count");
  if (!list || !count) return;

  list.innerHTML = '<div class="history-loading">Loading...</div>';
  const searches = await fetchUserSearchHistory(5);

  if (!searches.length) {
    count.textContent = "No activity yet";
    list.innerHTML = '<div class="history-empty">No search history yet.</div>';
    return;
  }

  count.textContent = `${searches.length} recent ${searches.length === 1 ? "search" : "searches"}`;
  list.innerHTML = searches.map((search) => {
    const safeQuery = String(search.query_text || "").replace(/'/g, "\\'");
    const safeType = String(search.search_type || "").replace(/'/g, "\\'");
    const preview = String(search.query_text || "").slice(0, 30);
    return `
      <div class="sidebar-history-item" onclick="replaySearch('${safeQuery}', '${safeType}')">
        <div class="sidebar-history-item-query" title="${preview}">${preview}</div>
        <div class="sidebar-history-item-meta">${formatSearchType(search.search_type)} • ${formatShortDate(search.created_at)}</div>
      </div>
    `;
  }).join("");
}

function replaySearch(queryText, searchType) {
  // Close dropdown
  const dropdown = document.getElementById("history-dropdown");
  const trigger = document.querySelector(".history-trigger");
  if (dropdown) dropdown.classList.remove("open");
  if (trigger) trigger.classList.remove("open");

  // Re-run the search
  if (searchType === "resume_upload") {
    showPage("analyzer");
    return;
  }

  if (searchType === "job_description") {
    document.getElementById("jd-input").value = queryText;
    analyzeJD();
  }
}

function closeSidebarSettingsMenu() {
  const menu = document.getElementById("sidebar-settings-menu");
  const trigger = document.getElementById("sidebar-settings-trigger");
  if (menu) menu.classList.remove("open");
  if (trigger) trigger.classList.remove("active");
}

async function loadSettingsSearchHistory() {
  const list = document.getElementById("settings-history-list");
  if (!list) return;

  list.innerHTML = '<div class="history-loading">Loading history...</div>';
  const searches = await fetchUserSearchHistory(6);

  if (!searches.length) {
    list.innerHTML = '<div class="history-empty">No search history yet.</div>';
    return;
  }

  list.innerHTML = searches.map((search, idx) => {
    const query = String(search.query_text || "");
    const type = String(search.search_type || "search");
    const isResumeUpload = type === "resume_upload";
    const queryPreview = escapeHtml(query.slice(0, 35));
    const encodedQuery = encodeURIComponent(query);
    const encodedType = encodeURIComponent(type);
    const when = formatShortDate(search.created_at) || "Recent";
    const metaText = isResumeUpload
      ? `ATS ${escapeHtml(String(search.result_count ?? 0))} • ${escapeHtml(when)}`
      : `${escapeHtml(formatSearchType(type))} • ${escapeHtml(when)}`;
    return `
      <button class="settings-history-item" type="button" data-query="${encodedQuery}" data-type="${encodedType}" data-index="${idx}">
        <div class="settings-history-query" title="${queryPreview}">${queryPreview}</div>
        <div class="settings-history-meta">${metaText}</div>
      </button>
    `;
  }).join("");

  list.querySelectorAll(".settings-history-item").forEach((button) => {
    button.addEventListener("click", () => {
      const query = decodeURIComponent(button.getAttribute("data-query") || "");
      const type = decodeURIComponent(button.getAttribute("data-type") || "search");
      replaySearch(query, type);
      closeSidebarSettingsMenu();
      showPage("analyzer");
    });
  });
}

async function toggleSidebarSettingsMenu(event) {
  if (event) event.stopPropagation();
  const menu = document.getElementById("sidebar-settings-menu");
  const trigger = document.getElementById("sidebar-settings-trigger");
  if (!menu || !trigger) return;

  const shouldOpen = !menu.classList.contains("open");
  closeSidebarSettingsMenu();

  if (!shouldOpen) return;

  menu.classList.add("open");
  trigger.classList.add("active");
  await loadSettingsSearchHistory();
}

function openProfileFromSettings() {
  closeSidebarSettingsMenu();
  showPage("profile");
}

async function openSettingsSearchHistory() {
  showPage("settings");
  await loadSettingsSearchHistory();
}

function openAboutSettings() {
  closeSidebarSettingsMenu();
  showPage("settings");
  const aboutCard = document.getElementById("settings-about-card");
  if (aboutCard) {
    aboutCard.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

function openHelpFeedback() {
  closeSidebarSettingsMenu();
  const subject = encodeURIComponent("ResumePro Help and Feedback");
  window.open(`mailto:resumepro.support@gmail.com?subject=${subject}`, "_blank");
  showToast("Opening your email app for feedback.", "success");
}

function logoutFromSettings() {
  closeSidebarSettingsMenu();
  logoutUser();
}

// Close dropdown when clicking outside
document.addEventListener("click", (event) => {
  const dropdown = document.getElementById("history-dropdown");
  const trigger = document.querySelector(".history-trigger");
  const card = document.getElementById("sidebar-user-card");
  const settingsMenu = document.getElementById("sidebar-settings-menu");
  const settingsTrigger = document.getElementById("sidebar-settings-trigger");

  const clickedInsideCard = card && event?.target instanceof Node && card.contains(event.target);
  const clickedOnHistoryTrigger = trigger && event?.target instanceof Node && trigger.contains(event.target);
  const clickedInsideSettings = settingsMenu && event?.target instanceof Node && settingsMenu.contains(event.target);
  const clickedOnSettingsTrigger = settingsTrigger && event?.target instanceof Node && settingsTrigger.contains(event.target);

  if (dropdown && dropdown.classList.contains("open")) {
    if (!clickedOnHistoryTrigger) {
      dropdown.classList.remove("open");
      trigger.classList.remove("open");
    }
  }

  if (card && card.classList.contains("expanded") && !clickedInsideCard) {
    card.classList.remove("expanded");
  }

  if (settingsMenu && settingsMenu.classList.contains("open") && !clickedInsideSettings && !clickedOnSettingsTrigger) {
    closeSidebarSettingsMenu();
  }
});

function getResetTokens() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_RESET_TOKENS_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveResetTokens(tokens) {
  localStorage.setItem(AUTH_RESET_TOKENS_KEY, JSON.stringify(tokens));
}

function generateResetCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function profileStorageKey(email = "") {
  return `${AUTH_PROFILE_KEY_PREFIX}${String(email || "guest").trim().toLowerCase()}`;
}

function getStoredProfile() {
  try {
    const session = getStoredSession() || {};
    return JSON.parse(localStorage.getItem(profileStorageKey(session.email)) || "{}");
  } catch {
    return {};
  }
}

function saveStoredProfile(profile) {
  const session = getStoredSession() || {};
  localStorage.setItem(profileStorageKey(session.email), JSON.stringify(profile));
}

function showAuthForm(mode) {
  const loginForm = document.getElementById("login-form");
  const registerForm = document.getElementById("register-form");
  const forgotForm = document.getElementById("forgot-form");
  const resetForm = document.getElementById("reset-form");
  const loginTab = document.getElementById("auth-login-tab");
  const registerTab = document.getElementById("auth-register-tab");

  // Hide all forms
  if (loginForm) loginForm.classList.remove("active");
  if (registerForm) registerForm.classList.remove("active");
  if (forgotForm) forgotForm.classList.remove("active");
  if (resetForm) resetForm.classList.remove("active");
  if (loginTab) loginTab.classList.remove("active");
  if (registerTab) registerTab.classList.remove("active");

  // Show selected form
  if (mode === "login" && loginForm) loginForm.classList.add("active");
  if (mode === "login" && loginTab) loginTab.classList.add("active");
  if (mode === "register" && registerForm) registerForm.classList.add("active");
  if (mode === "register" && registerTab) registerTab.classList.add("active");
  if (mode === "forgot" && forgotForm) forgotForm.classList.add("active");
  if (mode === "reset" && resetForm) resetForm.classList.add("active");
}

function ensureGuestAccessBanner() {
  let banner = document.getElementById("guest-access-banner");
  if (banner) return banner;

  banner = document.createElement("div");
  banner.id = "guest-access-banner";
  banner.className = "guest-access-banner";
  banner.innerHTML = `
    <div class="guest-access-text">Preview mode only. Login or register to access all features.</div>
    <div class="guest-access-actions">
      <button type="button" class="btn btn-primary" onclick="openAuthGate('login')">Login</button>
      <button type="button" class="btn btn-ghost" onclick="openAuthGate('register')">Register</button>
      <button type="button" class="btn btn-ghost" onclick="closeAuthGate()">Continue Preview</button>
    </div>
  `;
  document.body.appendChild(banner);
  return banner;
}

function openAuthGate(mode = "login") {
  const authScreen = document.getElementById("auth-screen");
  showAuthForm(mode === "register" ? "register" : "login");
  if (authScreen) authScreen.classList.add("active");
  const banner = document.getElementById("guest-access-banner");
  if (banner) banner.classList.remove("active");
}

function closeAuthGate() {
  const session = getStoredSession();
  const authScreen = document.getElementById("auth-screen");
  if (authScreen) authScreen.classList.remove("active");
  if (!session) {
    const banner = ensureGuestAccessBanner();
    banner.classList.add("active");
  }
}

function isAuthenticatedUser() {
  return !!getStoredSession();
}

function blockGuestWriteAccess(actionLabel = "this action") {
  if (isAuthenticatedUser()) return false;
  showToast(`Login or register to use ${actionLabel}.`, "warning");
  openAuthGate("login");
  return true;
}

function setAppVisibility(isAuthenticated) {
  const authScreen = document.getElementById("auth-screen");
  const app = document.querySelector(".app");
  if (authScreen) authScreen.classList.remove("active");
  if (app) {
    app.classList.remove("is-hidden");
    app.classList.remove("guest-locked");
  }

  const banner = document.getElementById("guest-access-banner");
  if (banner) banner.classList.toggle("active", !isAuthenticated);
}

function getDefaultProfile(sessionUser = {}) {
  return {
    name: sessionUser.name || "",
    email: sessionUser.email || "",
    phone: "",
    role: "",
    location: "",
    dob: "",
    linkedin: "",
    github: "",
    summary: "",
    skills: [],
    education: [],
    experience: [],
    projects: [],
  };
}

function loadProfileState() {
  const session = getStoredSession() || {};
  return { ...getDefaultProfile(session), ...getStoredProfile() };
}

function syncProfileInputs(profile) {
  const map = {
    "profile-name": profile.name,
    "profile-email": profile.email,
    "profile-phone": profile.phone,
    "profile-role": profile.role,
    "profile-location": profile.location,
    "profile-dob": profile.dob,
    "profile-linkedin": profile.linkedin,
    "profile-github": profile.github,
    "profile-summary": profile.summary,
    "profile-skills": normalizeList(profile.skills).join("\n"),
    "profile-experience": normalizeList(profile.experience).join("\n"),
  };

  Object.entries(map).forEach(([id, value]) => {
    const field = document.getElementById(id);
    if (field) field.value = value || "";
  });
}

function renderProfileSkillsCatalog() {
  const container = document.getElementById("profile-skills-catalog");
  if (!container) return;

  const query = (document.getElementById("profile-skill-search")?.value || "").trim().toLowerCase();
  const selectedSkills = new Set(normalizeList((document.getElementById("profile-skills")?.value || "").split("\n")));
  if (!query) {
    container.innerHTML = '<div class="profile-skill-empty">Type in search to view related software skills.</div>';
    return;
  }

  const allSkills = Array.from(new Set(SOFTWARE_SKILL_CATEGORIES.flatMap((group) => group.skills)));
  const matches = allSkills.filter((skill) => skill.toLowerCase().includes(query));

  if (!matches.length) {
    container.innerHTML = `<div class="profile-skill-empty">No software skills match "${escapeHtml(query)}"</div>`;
    return;
  }

  const chips = matches.map((skill) => {
    const isSelected = selectedSkills.has(skill);
    return `<button type="button" class="profile-skill-chip ${isSelected ? 'selected' : ''}" onclick="toggleProfileSkill(${JSON.stringify(skill)})">${escapeHtml(skill)}</button>`;
  }).join("");

  container.innerHTML = `
    <div class="profile-skill-group">
      <div class="profile-skill-group-title">Search Results (${matches.length})</div>
      <div class="profile-skill-group-chips">${chips}</div>
    </div>
  `;
}

function toggleProfileSkill(skill) {
  if (blockGuestWriteAccess("updating profile skills")) return;
  const field = document.getElementById("profile-skills");
  if (!field) return;

  const skills = normalizeList(field.value.split("\n"));
  const existingIndex = skills.findIndex((item) => item.toLowerCase() === String(skill).toLowerCase());
  if (existingIndex >= 0) {
    skills.splice(existingIndex, 1);
  } else {
    skills.push(skill);
  }

  field.value = skills.join("\n");
  renderProfileSkillsCatalog();
}

function saveProfileDetails() {
  if (blockGuestWriteAccess("saving profile")) return;
  const profile = {
    name: (document.getElementById("profile-name")?.value || "").trim(),
    email: (document.getElementById("profile-email")?.value || "").trim(),
    phone: (document.getElementById("profile-phone")?.value || "").trim(),
    role: (document.getElementById("profile-role")?.value || "").trim(),
    location: (document.getElementById("profile-location")?.value || "").trim(),
    dob: (document.getElementById("profile-dob")?.value || "").trim(),
    linkedin: (document.getElementById("profile-linkedin")?.value || "").trim(),
    github: (document.getElementById("profile-github")?.value || "").trim(),
    summary: (document.getElementById("profile-summary")?.value || "").trim(),
    skills: getTextAreaLines("profile-skills"),
    experience: getTextAreaLines("profile-experience"),
    educations: appState.profile?.educations || [],
    projects: appState.profile?.projects || [],
  };

  if (!profile.name || !profile.email || !profile.phone || !profile.summary || !profile.skills.length) {
    showToast("Please fill all required profile details: name, email, phone, and summary.", 'error');
    return;
  }

  const totalEducations = profile.educations.length;
  if (!totalEducations || !profile.projects.length) {
    showToast("Please add at least one education and one project.", 'warning');
    return;
  }

  const session = getStoredSession();
  if (session) {
    saveSession({ ...session, name: profile.name, email: profile.email });
    saveStoredProfile(profile);
    const users = getStoredUsers().map((user) => user.email === session.email ? { ...user, ...profile, password: user.password } : user);
    saveStoredUsers(users);
  } else {
    saveStoredProfile(profile);
  }
  appState.profile = profile;
  renderAuthenticatedUser(profile);
  renderProfile(appState);
  showToast("Profile saved successfully.", 'success');
}

// Switch between profile sections and update UI
function switchProfileSection(sectionId) {
  // Hide all sections
  const sections = document.querySelectorAll(".profile-section");
  sections.forEach(section => section.classList.remove("active"));

  // Remove active class from all nav items
  const navItems = document.querySelectorAll(".profile-nav-item");
  navItems.forEach(item => item.classList.remove("active"));

  // Show selected section
  const targetSection = document.getElementById(`profile-section-${sectionId}`);
  if (targetSection) {
    targetSection.classList.add("active");
  }

  // Mark nav item as active
  const targetNav = document.querySelector(`.profile-nav-item[onclick="switchProfileSection('${sectionId}')"]`);
  if (targetNav) {
    targetNav.classList.add("active");
  }
}

function addProfileEducation() {
  if (blockGuestWriteAccess("adding profile education")) return;
  const level = (document.getElementById("profile-edu-level")?.value || "10th").trim();
  const institution = (document.getElementById("profile-edu-institution")?.value || "").trim();
  const degree = (document.getElementById("profile-edu-degree")?.value || "").trim();
  const startCourse = (document.getElementById("profile-edu-start-course")?.value || "").trim();
  const endCourse = (document.getElementById("profile-edu-end-course")?.value || "").trim();
  const score = (document.getElementById("profile-edu-score")?.value || "").trim();

  if (!institution) {
    showToast("Please enter the school, college, or university name.", 'warning');
    return;
  }

  if (level === 'upper' && !degree) {
    showToast("Please enter the degree for upper education.", 'warning');
    return;
  }

  if (!appState.profile) appState.profile = {};
  if (!appState.profile.educations) appState.profile.educations = [];

  appState.profile.educations.push({
    level,
    institution,
    degree: degree || '',
    startCourse: startCourse || '',
    endCourse: endCourse || '',
    score: score || '',
    id: Date.now(),
  });

  const levelLabel = level === '10th' ? '10th' : level === 'inter' ? 'Inter' : 'Upper';
  document.getElementById("profile-edu-institution").value = "";
  document.getElementById("profile-edu-degree").value = "";
  document.getElementById("profile-edu-start-course").value = "";
  document.getElementById("profile-edu-end-course").value = "";
  document.getElementById("profile-edu-score").value = "";
  renderAllEducationCards();
  showToast(`${levelLabel} education added successfully`, 'success');
}

// Render all educations in one consolidated list
function renderAllEducationCards() {
  const container = document.getElementById("profile-education-all-list");
  if (!container) return;

  const educations = appState.profile?.educations || [];
  container.innerHTML = "";

  if (!educations.length) {
    container.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--text3); font-size: 13px;">No educations added yet. Add your education details above.</div>';
    return;
  }

  educations.forEach((edu, index) => {
    const typeLabel = edu.level === '10th' ? '10th Education' : edu.level === 'inter' ? 'Inter Education (12th)' : '';
    const badgeColor = edu.level === '10th' ? 'var(--accent)' : edu.level === 'inter' ? 'var(--accent2)' : 'var(--accent3)';
    const title = edu.level === 'upper' ? (edu.degree || edu.institution) : edu.institution;
    const subtitle = edu.level === 'upper' ? edu.institution : (edu.degree || '');
    const card = document.createElement("div");
    card.className = "profile-edu-card";
    card.style.borderLeft = `4px solid ${badgeColor}`;
    card.innerHTML = `
      <div class="profile-edu-card-header">
        <div>
          ${typeLabel ? `<div style="font-size: 12px; color: ${badgeColor}; font-weight: 600; text-transform: uppercase; margin-bottom: 6px;">${typeLabel}</div>` : ''}
          <div class="profile-edu-degree">${escapeHtml(title)}</div>
          ${subtitle ? `<div class="profile-edu-institution">${escapeHtml(subtitle)}</div>` : ''}
          <div class="profile-edu-meta">${edu.startCourse ? `Start: ${escapeHtml(edu.startCourse)}` : ''}${edu.startCourse && edu.endCourse ? ' • ' : ''}${edu.endCourse ? `End: ${escapeHtml(edu.endCourse)}` : ''}${(edu.startCourse || edu.endCourse) && edu.score ? ' • ' : ''}${edu.score ? escapeHtml(edu.score) : ''}</div>
        </div>
        <button class="profile-card-delete-btn" onclick="deleteProfileEducation(${index})">Delete</button>
      </div>
    `;
    container.appendChild(card);
  });
}

function deleteProfileEducation(index) {
  if (blockGuestWriteAccess("deleting profile education")) return;
  if (!appState.profile?.educations) return;
  appState.profile.educations.splice(index, 1);
  renderAllEducationCards();
  showToast("Education entry deleted", 'info');
}

// Add project entry to profile
function addProfileProject() {
  if (blockGuestWriteAccess("adding profile project")) return;
  const name = (document.getElementById("profile-project-name")?.value || "").trim();
  const description = (document.getElementById("profile-project-description")?.value || "").trim();
  const tech = (document.getElementById("profile-project-tech")?.value || "").trim();
  const duration = (document.getElementById("profile-project-duration")?.value || "").trim();
  const link = (document.getElementById("profile-project-link")?.value || "").trim();

  if (!name || !description) {
    showToast("Please fill in project name and description", 'warning');
    return;
  }

  // Store in appState if not exists
  if (!appState.profile) appState.profile = {};
  if (!appState.profile.projects) appState.profile.projects = [];

  const project = {
    name,
    description,
    tech: tech ? tech.split(',').map(t => t.trim()) : [],
    duration: duration || '',
    link: link || '',
    id: Date.now()
  };

  appState.profile.projects.push(project);
  renderProfileProjectCards();
  
  // Clear form
  document.getElementById("profile-project-name").value = "";
  document.getElementById("profile-project-description").value = "";
  document.getElementById("profile-project-tech").value = "";
  document.getElementById("profile-project-duration").value = "";
  document.getElementById("profile-project-link").value = "";
  
  showToast("Project added successfully", 'success');
}

// Render project cards
function renderProfileProjectCards() {
  const container = document.getElementById("profile-projects-list");
  if (!container) return;

  const projects = appState.profile?.projects || [];
  container.innerHTML = "";

  projects.forEach((proj, index) => {
    const techHTML = proj.tech && proj.tech.length > 0 
      ? `<div class="profile-project-tech">${proj.tech.map(t => `<span class="profile-project-tech-tag">${escapeHtml(t)}</span>`).join('')}</div>`
      : '';
    
    const metaHTML = (proj.duration || proj.link) 
      ? `<div class="profile-project-meta">${proj.duration ? `Duration: ${escapeHtml(proj.duration)}` : ''} ${proj.link ? `• <a href="${escapeHtml(proj.link)}" target="_blank" style="color: var(--accent); text-decoration: none;">View</a>` : ''}</div>`
      : '';
    
    const card = document.createElement("div");
    card.className = "profile-project-card";
    card.innerHTML = `
      <div class="profile-project-card-header">
        <div style="flex: 1;">
          <div class="profile-project-name">${escapeHtml(proj.name)}</div>
          <div class="profile-project-description">${escapeHtml(proj.description)}</div>
          ${techHTML}
          ${metaHTML}
        </div>
        <button class="profile-card-delete-btn" onclick="deleteProfileProject(${index})">Delete</button>
      </div>
    `;
    container.appendChild(card);
  });
}

// Delete project entry
function deleteProfileProject(index) {
  if (blockGuestWriteAccess("deleting profile project")) return;
  if (!appState.profile?.projects) return;
  appState.profile.projects.splice(index, 1);
  renderProfileProjectCards();
  showToast("Project deleted", 'info');
}

function renderAuthenticatedUser(user) {
  const nameEl = document.getElementById("sidebar-user-name");
  const emailEl = document.getElementById("sidebar-user-email");
  const providerEl = document.getElementById("sidebar-user-provider");
  const roleEl = document.getElementById("sidebar-user-role");
  const phoneEl = document.getElementById("sidebar-user-phone");
  const locationEl = document.getElementById("sidebar-user-location");
  const linkedinEl = document.getElementById("sidebar-user-linkedin");
  const githubEl = document.getElementById("sidebar-user-github");
  const avatar = document.querySelector(".profile-avatar");

  const profile = {
    ...getDefaultProfile(user),
    ...getStoredProfile(),
    ...(appState.profile || {}),
    ...(user || {}),
  };

  if (avatar) avatar.textContent = firstName(profile.name || profile.email || "U").slice(0, 1).toUpperCase();
  if (nameEl) nameEl.textContent = profile.name || profile.email || "User";
  if (emailEl) emailEl.textContent = profile.email || "";
  if (providerEl) providerEl.textContent = providerLabel(profile.provider);
  if (roleEl) roleEl.textContent = profile.role || "Not set";
  if (phoneEl) phoneEl.textContent = profile.phone || "Not set";
  if (locationEl) locationEl.textContent = profile.location || "Not set";
  if (linkedinEl) renderSidebarLink("sidebar-user-linkedin", profile.linkedin);
  if (githubEl) renderSidebarLink("sidebar-user-github", profile.github);
  updateSidebarSearchHistory();
}

function renderProfile(state) {
  const page = document.getElementById("page-profile");
  if (!page) return;

  const profile = state.profile || loadProfileState();
  const title = page.querySelector(".page-title");
  const sub = page.querySelector(".page-sub");
  if (title) title.textContent = profile.name ? `${profile.name}'s Profile` : "Profile";
  if (sub) sub.textContent = "Required details used throughout the platform and resume builder";

  syncProfileInputs(profile);
  renderProfileSkillsCatalog();

  const skillsField = document.getElementById("profile-skills");
  if (skillsField && !skillsField.dataset.skillCatalogBound) {
    skillsField.addEventListener("input", () => renderProfileSkillsCatalog());
    skillsField.dataset.skillCatalogBound = "1";
  }

  const skillSearchField = document.getElementById("profile-skill-search");
  if (skillSearchField && !skillSearchField.dataset.skillSearchBound) {
    skillSearchField.addEventListener("input", () => renderProfileSkillsCatalog());
    skillSearchField.dataset.skillSearchBound = "1";
  }

  // Sync educations to appState
  if (!appState.profile) appState.profile = {};
  if (profile.educations && profile.educations.length > 0) {
    appState.profile.educations = profile.educations;
  } else {
    const legacyEducations = [];
    (profile.educations_10th || []).forEach((edu) => {
      legacyEducations.push({ level: '10th', institution: edu.school || edu.institution || '', degree: '', startCourse: edu.startCourse || '', endCourse: edu.year || edu.endCourse || '', score: edu.cgpa || edu.score || '', id: edu.id || Date.now() });
    });
    (profile.educations_inter || []).forEach((edu) => {
      legacyEducations.push({ level: 'inter', institution: edu.school || edu.institution || '', degree: '', startCourse: edu.startCourse || '', endCourse: edu.year || edu.endCourse || '', score: edu.cgpa || edu.score || '', id: edu.id || Date.now() });
    });
    (profile.educations_upper || []).forEach((edu) => {
      legacyEducations.push({ level: 'upper', institution: edu.institution || '', degree: edu.degree || '', startCourse: edu.startCourse || '', endCourse: edu.year || edu.endCourse || '', score: edu.cgpa || edu.score || '', id: edu.id || Date.now() });
    });
    appState.profile.educations = legacyEducations;
  }

  if (profile.projects && profile.projects.length > 0) {
    appState.profile.projects = profile.projects;
  } else if (!appState.profile.projects) {
    appState.profile.projects = [];
  }

  const metrics = page.querySelectorAll(".profile-metric-value");
  if (metrics[0]) metrics[0].textContent = String(normalizeList(profile.skills).length);
  if (metrics[1]) metrics[1].textContent = String(normalizeList(profile.experience).length);
  
  const totalEducations = appState.profile?.educations?.length || 0;
  if (metrics[2]) metrics[2].textContent = String(totalEducations);
  if (metrics[3]) metrics[3].textContent = String((appState.profile?.projects || []).length);

  // Render education cards and project cards
  renderAllEducationCards();
  renderProfileProjectCards();
}

function authAlert(message) {
  showToast(message, 'info');
}

function showToast(message, type = 'info', duration = 3500) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease-out forwards';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

async function registerUser() {
  const name = (document.getElementById("register-name")?.value || "").trim();
  const email = (document.getElementById("register-email")?.value || "").trim().toLowerCase();
  const password = (document.getElementById("register-password")?.value || "").trim();
  const confirmPassword = (document.getElementById("register-confirm-password")?.value || "").trim();

  if (!name || !email || !password || !confirmPassword) {
    showToast("Please fill in all registration fields.", 'warning');
    return;
  }

  if (password.length < 6) {
    showToast("Password must be at least 6 characters long.", 'warning');
    return;
  }

  if (password !== confirmPassword) {
    showToast("Passwords do not match.", 'warning');
    return;
  }

  const backendResp = await postJsonAllowStatus(`${BACKEND_BASE_URL}/users/register`, {
    name,
    email,
    password,
  });

  if (backendResp.ok) {
    const backendUser = backendResp.data?.user || { name, email, provider: "local" };
    saveSession({ name: backendUser.name, email: backendUser.email, provider: backendUser.provider || "local" });
    appState.profile = loadProfileState();
    renderAuthenticatedUser(backendUser);
    setAppVisibility(true);
    showPage("dashboard");
    renderAllPages(appState);
    window.scrollTo({ top: 0, behavior: "instant" });
    showToast("Account created successfully.", 'success');
    return;
  }

  if (backendResp.status === 409) {
    showToast("An account with this email already exists.", 'error');
    return;
  }

  const users = getStoredUsers();
  if (users.some((user) => user.email === email)) {
    showToast("An account with this email already exists.", 'error');
    return;
  }

  const newUser = { name, email, password, provider: "local" };
  users.push(newUser);
  saveStoredUsers(users);
  saveSession({ name, email, provider: "local" });
  appState.profile = loadProfileState();
  renderAuthenticatedUser(newUser);
  setAppVisibility(true);
  showPage("dashboard");
  renderAllPages(appState);
  window.scrollTo({ top: 0, behavior: "instant" });
  showToast("Account created successfully (local mode).", 'success');
}

async function loginUser() {
  const email = (document.getElementById("login-email")?.value || "").trim().toLowerCase();
  const password = (document.getElementById("login-password")?.value || "").trim();

  if (!email || !password) {
    showToast("Enter your email and password.", 'warning');
    return;
  }

  const backendResp = await postJsonAllowStatus(`${BACKEND_BASE_URL}/users/login`, {
    email,
    password,
  });

  if (backendResp.ok) {
    const user = backendResp.data?.user || { email, name: email.split("@")[0], provider: "local" };
    saveSession({ name: user.name, email: user.email, provider: user.provider || "local" });
    appState.profile = loadProfileState();
    renderAuthenticatedUser(user);
    setAppVisibility(true);
    showPage("dashboard");
    renderAllPages(appState);
    window.scrollTo({ top: 0, behavior: "instant" });
    return;
  }

  const users = getStoredUsers();
  const user = users.find((entry) => entry.email === email && entry.password === password);
  if (!user) {
    showToast("Invalid email or password.", 'error');
    return;
  }

  saveSession({ name: user.name, email: user.email, provider: user.provider || "local" });
  appState.profile = loadProfileState();
  renderAuthenticatedUser(user);
  setAppVisibility(true);
  showPage("dashboard");
  renderAllPages(appState);
  window.scrollTo({ top: 0, behavior: "instant" });
  showToast("Logged in using local data (backend unavailable).", 'warning');
}

function logoutUser() {
  clearPersistentAppState();
  clearSession();
  appState.profile = getDefaultProfile();
  setAppVisibility(false);
}

function sendPasswordReset() {
  const email = (document.getElementById("forgot-email")?.value || "").trim().toLowerCase();

  if (!email) {
    showToast("Please enter your email address.", 'warning');
    return;
  }

  const users = getStoredUsers();
  const user = users.find((entry) => entry.email === email);
  if (!user) {
    showToast("No account found with this email address.", 'error');
    return;
  }

  const resetCode = generateResetCode();
  const tokens = getResetTokens();
  tokens[email] = { code: resetCode, timestamp: Date.now() };
  saveResetTokens(tokens);

  showToast(`Reset code: ${resetCode} (expires in 1 hour)`, 'success');
  document.getElementById("forgot-email").value = "";
  showAuthForm("reset");
}

function confirmPasswordReset() {
  const email = (document.getElementById("forgot-email")?.value || "").trim().toLowerCase() || 
    getStoredUsers().find(u => {
      const tokens = getResetTokens();
      return tokens[u.email];
    })?.email;

  const resetCode = (document.getElementById("reset-code")?.value || "").trim().toUpperCase();
  const newPassword = (document.getElementById("reset-password")?.value || "").trim();
  const confirmPassword = (document.getElementById("reset-confirm-password")?.value || "").trim();

  if (!resetCode || !newPassword || !confirmPassword) {
    showToast("Please fill in all fields.", 'warning');
    return;
  }

  if (newPassword.length < 6) {
    showToast("Password must be at least 6 characters long.", 'warning');
    return;
  }

  if (newPassword !== confirmPassword) {
    showToast("Passwords do not match.", 'warning');
    return;
  }

  const tokens = getResetTokens();
  let foundEmail = null;
  
  for (const [storedEmail, tokenData] of Object.entries(tokens)) {
    if (tokenData.code === resetCode) {
      const currentTime = Date.now();
      const tokenAge = currentTime - tokenData.timestamp;
      const oneHour = 60 * 60 * 1000;
      
      if (tokenAge > oneHour) {
        showToast("Reset code has expired. Please request a new one.", 'error');
        return;
      }
      
      foundEmail = storedEmail;
      break;
    }
  }

  if (!foundEmail) {
    showToast("Invalid reset code.", 'error');
    return;
  }

  const users = getStoredUsers();
  const userIndex = users.findIndex((u) => u.email === foundEmail);
  if (userIndex === -1) {
    showToast("User not found.", 'error');
    return;
  }

  users[userIndex].password = newPassword;
  saveStoredUsers(users);

  delete tokens[foundEmail];
  saveResetTokens(tokens);

  document.getElementById("reset-code").value = "";
  document.getElementById("reset-password").value = "";
  document.getElementById("reset-confirm-password").value = "";

  showToast("Password reset successfully. You can now login with your new password.", 'success');
  showAuthForm("login");
}

function courseForSkill(skill) {
  const lowerSkill = (skill || "").toLowerCase();

  if (lowerSkill.includes("docker") || lowerSkill.includes("kubernetes")) {
    return {
      platform: "Udemy · 12hr · ₹499",
      title: "Docker & Kubernetes: The Complete Guide",
      rating: "4.7 · 180k students",
      progress: 0,
      label: "Critical Gap",
      tagClass: "tag-red",
      progressText: "Not started",
    };
  }

  if (lowerSkill.includes("system design")) {
    return {
      platform: "Coursera (Google) · 8hr · Free audit",
      title: "System Design Fundamentals",
      rating: "4.9 · 92k students",
      progress: 0,
      label: "Critical Gap",
      tagClass: "tag-red",
      progressText: "Not started",
    };
  }

  if (lowerSkill.includes("rest") || lowerSkill.includes("api")) {
    return {
      platform: "FreeCodeCamp · 6hr · Free",
      title: "REST API Design with Node.js & Express",
      rating: "4.6 · 54k students",
      progress: 35,
      label: "Important",
      tagClass: "tag-orange",
      progressText: "35% complete",
    };
  }

  if (lowerSkill.includes("sql") || lowerSkill.includes("postgres")) {
    return {
      platform: "Khan Academy · 4hr · Free",
      title: "SQL & PostgreSQL for Beginners",
      rating: "4.5 · 38k students",
      progress: 10,
      label: "Important",
      tagClass: "tag-orange",
      progressText: "10% complete",
    };
  }

  if (lowerSkill.includes("ci/cd") || lowerSkill.includes("cicd") || lowerSkill.includes("pipeline")) {
    return {
      platform: "LinkedIn Learning · 5hr",
      title: "CI/CD Pipelines with GitHub Actions",
      rating: "4.7 · 41k students",
      progress: 0,
      label: "Important",
      tagClass: "tag-orange",
      progressText: "Not started",
    };
  }

  return {
    platform: "Project-based learning · 6hr",
    title: `${skill} Practice Project`,
    rating: "Build one resume-aligned project",
    progress: 20,
    label: "Next up",
    tagClass: "tag-purple",
    progressText: "20% complete",
  };
}

function renderSkillsChips(container, items, emptyLabel, options = {}) {
  const { removable = false } = options;
  if (!container) return;
  const list = normalizeList(items);
  if (!list.length) {
    container.innerHTML = `<span class="chip">${escapeHtml(emptyLabel)}</span>`;
    return;
  }

  container.innerHTML = list
    .map((item) => removable
      ? `<span class="chip">${escapeHtml(item)} <span class="chip-remove" onclick="removeChip(this)">&#10005;</span></span>`
      : `<span class="chip">${escapeHtml(item)}</span>`)
    .join("");
}

function renderSectionCards(container, items, emptyLabel) {
  if (!container) return;
  const list = normalizeList(items);
  if (!list.length) {
    container.innerHTML = emptyLabel
      ? `<div style="background:var(--surface2);border-radius:10px;padding:10px 12px;color:var(--text3);font-size:13px;">${escapeHtml(emptyLabel)}</div>`
      : "";
    return;
  }

  container.innerHTML = list
    .map(
      (item) => `
        <div style="background:var(--surface2);border-radius:10px;padding:10px 12px;">
          <div style="font-size:13px;font-weight:500;margin-bottom:4px;">${escapeHtml(item)}</div>
        </div>`
    )
    .join("");
}

function setResumeTemplate(templateId) {
  const next = RESUME_TEMPLATES.includes(templateId) ? templateId : "jonathan";
  if (appState.resume_template === next) return;
  appState.resume_template = next;
  savePersistentAppState();
  renderBuilder(appState);
  switchTab("preview");
}

function renderTemplateSelector(selected) {
  const labels = {
    jonathan: "Jonathan",
    robert: "Robert",
    firstlast: "First Last",
    omar: "Omar",
  };

  return RESUME_TEMPLATES.map((templateId) => `
    <button type="button" class="resume-template-chip ${selected === templateId ? "active" : ""}" onclick="setResumeTemplate('${templateId}')">${labels[templateId]}</button>
  `).join("");
}

function parseStructuredLine(line, labels) {
  const parts = String(line || "")
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);

  const result = {};
  labels.forEach((label, index) => {
    result[label] = parts[index] || "";
  });
  result.raw = String(line || "").trim();
  return result;
}

function uniqueNormalizedLines(items) {
  const seen = new Set();
  const unique = [];

  normalizeList(items).forEach((line) => {
    const cleaned = String(line || "")
      .replace(/^[\u2022\-*]+\s*/, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!cleaned) return;

    const key = cleaned.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    unique.push(cleaned);
  });

  return unique;
}

function groupTechnicalSkills(skillsList) {
  const skills = uniqueNormalizedLines(skillsList || []);
  if (!skills.length) {
    return {
      languages: ["Python", "Java", "JavaScript", "SQL"],
      tools: ["VS Code", "Git", "Jenkins"],
      frameworks: ["React", "Node.js", "FastAPI"],
    };
  }

  const languageSet = new Set(["python", "java", "javascript", "typescript", "c", "c++", "c#", "go", "rust", "php", "ruby", "kotlin", "swift", "sql", "html", "css"]);
  const toolSet = new Set(["git", "github", "gitlab", "vscode", "eclipse", "android studio", "postman", "jenkins", "docker", "kubernetes", "aws", "gcp", "azure"]);

  const grouped = { languages: [], tools: [], frameworks: [] };
  skills.forEach((skill) => {
    const key = skill.toLowerCase().trim();
    if (languageSet.has(key)) {
      grouped.languages.push(skill);
      return;
    }
    if (toolSet.has(key)) {
      grouped.tools.push(skill);
      return;
    }
    grouped.frameworks.push(skill);
  });

  return {
    languages: grouped.languages.length ? grouped.languages : skills.slice(0, Math.min(4, skills.length)),
    tools: grouped.tools,
    frameworks: grouped.frameworks,
  };
}

function parseCourseworkItems(courseworkValue) {
  if (Array.isArray(courseworkValue)) return uniqueNormalizedLines(courseworkValue);
  return uniqueNormalizedLines(
    String(courseworkValue || "")
      .split(/[\n,]/)
      .map((item) => item.trim())
      .filter(Boolean)
  );
}

function parseEducationPreviewEntry(item) {
  const source = item && typeof item === "object" ? item : { raw: item };
  const raw = String(source.raw || source.value || source.text || "").replace(/\s+/g, " ").trim();
  const degreeHintRegex = /\b(bachelor|master|b\.?\s?tech|m\.?\s?tech|b\.?\s?e\.?|m\.?\s?e\.?|associate(?:'s)?|intermediate|inter\b|ssc\b|hsc\b|10th|12th|diploma)\b/i;
  const institutionHintRegex = /\b(university|college|institute|school|academy|campus|polytechnic)\b/i;
  const explicitDegree = String(source.degree || source.title || "").replace(/\s+/g, " ").trim();
  const explicitInstitution = String(source.institution || source.school || "").replace(/\s+/g, " ").trim();
  const explicitLocation = String(source.location || source.city || "").replace(/\s+/g, " ").trim();
  let date = String(source.years || source.date || source.duration || "").replace(/\s+/g, " ").trim();
  let score = String(source.gpa || source.score || "").replace(/\s+/g, " ").trim();
  let degree = explicitDegree;

  const dateRegex = /(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}\s*[-–]\s*(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}\s*[-–]\s*(?:\d{4}|Present|Current)|\d{4}\s*[-–]\s*(?:\d{4}|Present|Current)/i;
  const rawDateMatch = raw.match(dateRegex);
  if (!date && rawDateMatch) {
    date = rawDateMatch[0].replace(/\s+/g, " ").trim();
  }

  let institution = explicitInstitution;
  let location = explicitLocation;
  let workingText = raw;

  // Prefer splitting legacy pipe-formatted lines first.
  const pipeParts = raw.split("|").map((part) => part.trim()).filter(Boolean);
  if (pipeParts.length > 1) {
    pipeParts.forEach((part) => {
      if (!institution && institutionHintRegex.test(part)) {
        institution = part;
        return;
      }
      if (!degree && degreeHintRegex.test(part)) {
        degree = part;
        return;
      }
      if (!date && dateRegex.test(part)) {
        const match = part.match(dateRegex);
        if (match) date = match[0].replace(/\s+/g, " ").trim();
        return;
      }
      if (!location && /,\s*[A-Za-z]/.test(part) && !degreeHintRegex.test(part) && !dateRegex.test(part)) {
        location = part;
        return;
      }
      if (!score && /\b(?:\d{1,2}(?:\.\d+)?%?|\d\.\d{1,2})\b/.test(part) && /\b(?:gpa|cgpa|score|%|\.\d)\b/i.test(part)) {
        score = part;
      }
    });
  }

  if (!institution && workingText) {
    const commaParts = workingText.split(",").map((part) => part.trim()).filter(Boolean);
    if (commaParts.length >= 2) {
      institution = commaParts.shift() || "";
      location = location || commaParts.join(", ");
    } else {
      const dateIndex = rawDateMatch ? raw.indexOf(rawDateMatch[0]) : -1;
      const leftSide = dateIndex >= 0 ? raw.slice(0, dateIndex).trim() : raw;
      const rightSide = dateIndex >= 0 ? raw.slice(dateIndex + rawDateMatch[0].length).trim() : "";
      const leftTokens = leftSide.split(/\s*[-–|]\s*/).map((part) => part.trim()).filter(Boolean);
      const rightTokens = rightSide.split(/\s*[-–|,]\s*/).map((part) => part.trim()).filter(Boolean);

      if (!institution && leftTokens.length >= 2) {
        institution = leftTokens[leftTokens.length - 1] || leftTokens[0] || "";
      }
      if (!location && rightTokens.length) {
        location = rightTokens.join(", ");
      }
    }
  }

  if (institution && workingText) {
    const institutionIndex = workingText.toLowerCase().indexOf(institution.toLowerCase());
    if (institutionIndex >= 0) {
      workingText = workingText.slice(institutionIndex + institution.length).trim();
    }
  }

  if (!location && workingText) {
    let remainder = workingText;
    if (date && remainder.includes(date)) {
      remainder = remainder.replace(date, " ");
    }
    if (degree && remainder.toLowerCase().includes(degree.toLowerCase())) {
      remainder = remainder.replace(new RegExp(degree.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), " ");
    }
    remainder = remainder.replace(/^[,|\-–\s]+|[,|\-–\s]+$/g, "").trim();
    if (remainder && !/\b(?:gpa|score|cgpa)\b/i.test(remainder)) {
      location = remainder;
    }
  }

  if (!institution && raw) {
    institution = raw;
  }

  if (!degree && raw && raw !== institution) {
    degree = raw;
  }

  if (degree) {
    const degreeDateMatch = degree.match(dateRegex);
    if (!date && degreeDateMatch) {
      date = degreeDateMatch[0].replace(/\s+/g, " ").trim();
    }
    if (degreeDateMatch) {
      degree = degree.replace(degreeDateMatch[0], " ").replace(/^[,|\-–\s]+|[,|\-–\s]+$/g, "").replace(/\s+/g, " ").trim();
    }
  }

  if (location) {
    // Prevent combined strings (location + degree + date) from rendering on the right side.
    if (location.includes("|") || degreeHintRegex.test(location) || dateRegex.test(location) || location.length > 44) {
      const locationOnly = location.match(/[A-Za-z .'-]+,\s*[A-Za-z .'-]+/);
      location = locationOnly ? locationOnly[0].trim() : "";
    }
  }

  if (degree && degree.includes("|")) {
    const degreePart = degree.split("|").map((part) => part.trim()).find((part) => degreeHintRegex.test(part));
    degree = degreePart || degree.split("|")[0].trim();
  }

  return {
    degree,
    institution,
    location,
    date,
    score,
  };
}

function renderResumeTemplatePreview(resumeData, skills, templateId, rawText = "") {
  const safeName = escapeHtml((resumeData.name || "Your Name").trim() || "Your Name");
  const safeRoleTitle = escapeHtml(String(resumeData.role || "").toUpperCase());
  const safeSummary = escapeHtml(resumeData.summary || "Build your resume using the form above, then click Preview to see the formatted result.");
  const contactItems = [
    resumeData.phone || "",
    resumeData.email || "",
    resumeData.linkedin || "",
    resumeData.github || "",
  ].filter(Boolean);
  const contactLine = contactItems.map((item) => `<span>${escapeHtml(item)}</span>`).join("<span class=\"resume-contact-sep\">|</span>");
  const addressLine = escapeHtml(resumeData.location || "");

  const educationItems = Array.isArray(resumeData.education) ? resumeData.education : [];
  const experienceLines = uniqueNormalizedLines(resumeData.experience);
  const projectLines = uniqueNormalizedLines(resumeData.projects);
  const structuredProjects = projectLines.length
    ? parseStructuredProjects("", projectLines)
    : parseStructuredProjects(rawText, []);
  const certifications = uniqueNormalizedLines(resumeData.certifications || []);
  const certificationEntries = certifications
    .map((line) => parseCertificationPreviewEntry(line))
    .filter((item) => item.name || item.details || item.date);
  const achievements = uniqueNormalizedLines(resumeData.achievements || []);
  const skillsList = uniqueNormalizedLines(skills.length ? skills : []);
  const courseworkItems = parseCourseworkItems(resumeData.coursework || []);
  const groupedSkills = groupTechnicalSkills(skillsList);

  const educationEntries = educationItems
    .map((item) => parseEducationPreviewEntry(item))
    .filter((entry) => entry.institution || entry.degree || entry.location || entry.date || entry.score);

  const educationCards = educationEntries.map((entry) => {
    const hasSecondLine = Boolean(entry.degree || entry.date || entry.score);
    const metaLine = entry.date || entry.score || "";
    return `
      <div class="resume-education-entry">
        <div class="resume-education-row">
          <div class="resume-education-left">${escapeHtml(entry.institution)}</div>
          <div class="resume-education-right">${escapeHtml(entry.location || "")}</div>
        </div>
        ${hasSecondLine ? `
        <div class="resume-education-row resume-education-row-sub">
          <div class="resume-education-left"><em>${escapeHtml(entry.degree || "")}</em></div>
          <div class="resume-education-right"><em>${escapeHtml(metaLine)}</em></div>
        </div>` : ""}
      </div>
    `;
  }).join("");

  const experienceCards = experienceLines.length
    ? experienceLines
        .slice(0, 5)
        .map((line) => {
          const entry = parseStructuredLine(line, ["title", "company", "duration", "impact"]);
          return `
            <article class="resume-entry resume-classic-entry">
              <div class="resume-entry-head resume-classic-entry-head">
                <h4>${escapeHtml(entry.company || "Company")}</h4>
                <span>${escapeHtml(entry.duration || "")}</span>
              </div>
              <div class="resume-classic-entry-subrow">
                <div class="resume-entry-sub"><em>${escapeHtml(entry.title || "Role")}</em></div>
                <div class="resume-entry-sub"><em>${escapeHtml(entry.location || "")}</em></div>
              </div>
              <ul class="resume-bullets">
                <li>${escapeHtml(entry.impact || entry.raw || "Delivered measurable impact through high-quality implementation.")}</li>
              </ul>
            </article>
          `;
        })
        .join("")
    : "";

  const projectCards = structuredProjects
    .slice(0, 4)
    .map((project) => `
      <article class="resume-entry resume-classic-entry">
        <div class="resume-entry-head resume-classic-entry-head">
          <h4>${escapeHtml(project.title || "Project")}${project.tech ? ` <span class="resume-project-tech">| ${escapeHtml(project.tech)}</span>` : ""}</h4>
          <span>${escapeHtml(project.date || "")}</span>
        </div>
        <ul class="resume-bullets">
          ${(project.bullets && project.bullets.length ? project.bullets : ["Implemented end-to-end features with documented results."])
            .slice(0, 3)
            .map((bullet) => `<li>${escapeHtml(bullet)}</li>`)
            .join("")}
        </ul>
      </article>
    `)
    .join("");

  const technicalSkillsBlock = `
    <div class="resume-tech-lines">
      <div><strong>Languages:</strong> ${escapeHtml(groupedSkills.languages.join(", ")) || "-"}</div>
      <div><strong>Developer Tools:</strong> ${escapeHtml(groupedSkills.tools.join(", ")) || "-"}</div>
      <div><strong>Technologies/Frameworks:</strong> ${escapeHtml(groupedSkills.frameworks.join(", ")) || "-"}</div>
    </div>
  `;

  const leadershipItems = achievements.length ? achievements : [];
  const hasDetailedContent = Boolean(
    educationEntries.length ||
      experienceCards ||
      projectCards ||
      certificationEntries.length ||
      leadershipItems.length ||
      courseworkItems.length ||
      skillsList.length
  );

  if (!hasDetailedContent) {
    return `
      <div class="resume-a4 resume-classic resume-tone-${escapeHtml(templateId)}">
        <header class="resume-head resume-classic-head" style="text-align:left;">
          <h1>${safeName}</h1>
          <p>${safeRoleTitle}</p>
        </header>
        <section class="resume-block">
          <h3 class="resume-classic-title">Summary</h3>
          <p>${safeSummary}</p>
        </section>
      </div>
    `;
  }

  return `
    <div class="resume-a4 resume-classic resume-tone-${escapeHtml(templateId)}">
      <header class="resume-head resume-classic-head">
        <h1>${safeName}</h1>
        <p>${safeRoleTitle}</p>
        ${addressLine ? `<div class="resume-classic-address">${addressLine}</div>` : ""}
        ${contactLine ? `<div class="resume-contact">${contactLine}</div>` : ""}
      </header>

      <section class="resume-block">
        <h3 class="resume-classic-title">Summary</h3>
        <p>${safeSummary}</p>
      </section>

      ${educationCards ? `<section class="resume-block">
        <h3 class="resume-classic-title resume-education-title">Education</h3>
        ${educationCards}
      </section>` : ""}

      ${courseworkItems.length ? `
      <section class="resume-block">
        <h3 class="resume-classic-title">Relevant Coursework</h3>
        <ul class="resume-coursework-grid">
          ${courseworkItems.slice(0, 16).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
        </ul>
      </section>` : ""}

      ${experienceCards ? `
      <section class="resume-block">
        <h3 class="resume-classic-title">Experience</h3>
        ${experienceCards}
      </section>` : ""}

      ${projectCards ? `<section class="resume-block">
        <h3 class="resume-classic-title">Projects</h3>
        ${projectCards}
      </section>` : ""}

      ${(groupedSkills.languages.length || groupedSkills.tools.length || groupedSkills.frameworks.length) ? `<section class="resume-block">
        <h3 class="resume-classic-title">Technical Skills</h3>
        ${technicalSkillsBlock}
      </section>` : ""}

      ${certificationEntries.length ? `
      <section class="resume-block">
        <h3 class="resume-classic-title">Certifications</h3>
        <div class="resume-cert-list">
          ${certificationEntries.slice(0, 6).map((item) => `
            <article class="resume-cert-item">
              <div class="resume-cert-head">
                <div class="resume-cert-name">${escapeHtml(item.name)}</div>
                <div class="resume-cert-date">${escapeHtml(item.date)}</div>
              </div>
              <div class="resume-cert-sub">
                <div class="resume-cert-details">${escapeHtml(item.details)}</div>
                ${item.linkUrl
                  ? `<a class="resume-cert-link" href="${escapeHtml(item.linkUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.linkLabel)}</a>`
                  : `<div class="resume-cert-link">${escapeHtml(item.linkLabel)}</div>`}
              </div>
            </article>
          `).join("")}
        </div>
      </section>` : ""}

      ${leadershipItems.length ? `
      <section class="resume-block">
        <h3 class="resume-classic-title">Leadership / Extracurricular</h3>
        <ul class="resume-bullets">
          ${leadershipItems.slice(0, 6).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
        </ul>
      </section>` : ""}
    </div>
  `;
}

function renderDashboard(state) {
  const page = document.getElementById("page-dashboard");
  if (!page) return;

  const resumeData = state.resume_data || {};
  const skills = state.skills || [];
  const jobData = state.job_data || { matches: [] };
  const careerData = state.career_data || { eligible: [], nearly_eligible: [], not_ready: [] };
  const optData = state.opt_data || { optimized_skills: [], added_keywords: [], suggestions: [] };
  const atsData = state.ats_data || null;
  const matches = jobData.matches || [];
  const topJob = matches[0] || {};
  const missingSkills = normalizeList(topJob.missing_skills || optData.added_keywords || []);
  const hasResume = Boolean(skills.length || resumeData.name || resumeData.email || resumeData.phone || normalizeList(resumeData.summary).length);
  const matchScore = hasResume ? Math.round(atsData?.score || topJob.match || (skills.length ? Math.min(98, Math.max(40, skills.length * 12)) : 0)) : 0;
  const totalSkills = hasResume ? (skills.length + missingSkills.length || skills.length || 1) : 0;
  const name = firstName(resumeData.name);
  const atsBreakdown = atsData?.breakdown || {};
  const atsMissingKeywords = normalizeList(atsData?.missing_keywords || missingSkills);

  const pageTitle = page.querySelector(".page-title");
  const pageSub = page.querySelector(".page-sub");
  if (pageTitle) pageTitle.textContent = hasResume ? `Welcome back, ${name}` : "Welcome back";
  if (pageSub) pageSub.textContent = hasResume ? `Your career profile was refreshed from your resume` : "Upload your resume to populate this dashboard";

  const statCards = page.querySelectorAll(".stat-card");
  if (statCards[0]) {
    statCards[0].querySelector(".stat-value").textContent = hasResume ? String(matchScore) : "";
    statCards[0].querySelector(".stat-change").textContent = hasResume ? `${atsData?.label || "ATS readiness"}` : "";
  }
  if (statCards[1]) {
    statCards[1].querySelector(".stat-value").innerHTML = hasResume ? `${skills.length}<span style="font-size:16px;color:var(--text3);">/${totalSkills}</span>` : "";
    statCards[1].querySelector(".stat-change").textContent = hasResume ? `${normalizeList(resumeData.education).length + normalizeList(resumeData.projects).length + normalizeList(resumeData.experience).length} resume sections detected` : "";
  }
  if (statCards[2]) {
    statCards[2].querySelector(".stat-value").textContent = hasResume ? String((careerData.eligible || []).length) : "";
    statCards[2].querySelector(".stat-change").textContent = hasResume ? `${matches.length} personalized matches analyzed` : "";
  }
  if (statCards[3]) {
    statCards[3].querySelector(".stat-value").textContent = hasResume ? String(missingSkills.length) : "";
    statCards[3].querySelector(".stat-change").textContent = hasResume ? `${missingSkills.length ? "Skills to learn next" : "No critical gaps detected"}` : "";
  }

  const scoreRing = page.querySelector(".score-ring");
  if (scoreRing) {
    const scoreNum = scoreRing.querySelector(".score-num");
    const scoreLbl = scoreRing.querySelector(".score-lbl");
    const circle = scoreRing.querySelectorAll("circle")[1];
    if (scoreNum) scoreNum.textContent = hasResume ? String(matchScore) : "";
    if (scoreLbl) scoreLbl.textContent = hasResume ? (atsData?.mode === "job-matched" ? "/ 100" : "") : "";
    if (circle) {
      const dash = 314;
      circle.setAttribute("stroke-dasharray", String(dash));
      circle.setAttribute("stroke-dashoffset", String(hasResume ? Math.max(0, dash - (dash * matchScore) / 100) : dash));
    }
  }

  const skillsRows = page.querySelectorAll(".skill-row");
  const metrics = atsData
    ? [
        atsBreakdown.keywords || 0,
        atsBreakdown.sections || 0,
        atsBreakdown.skills || 0,
        atsBreakdown.formatting || 0,
      ]
    : [0, 0, 0, 0];
  skillsRows.forEach((row, index) => {
    const pct = metrics[index] || 0;
    const fill = row.querySelector(".skill-bar-fill");
    const label = row.querySelector(".skill-pct");
    if (fill) fill.style.width = hasResume ? `${pct}%` : "0%";
    if (label) label.textContent = hasResume ? `${pct}%` : "";
  });

  const gapsCard = page.querySelectorAll(".card")[1];
  if (gapsCard) {
    const gaps = hasResume ? (atsMissingKeywords.length ? atsMissingKeywords : (missingSkills.length ? missingSkills : (optData.added_keywords || []))) : [];
    const rows = gapsCard.querySelectorAll("div[style*='display:flex;align-items:center;justify-content:space-between']");
    rows.forEach((row, index) => {
      const skill = gaps[index] || "";
      const tag = row.querySelector(".tag");
      const text = row.querySelector("div");
      if (text) text.textContent = skill;
      if (tag) {
        tag.className = "tag " + (index < 2 ? "tag-red" : index < 4 ? "tag-orange" : "tag-purple");
        tag.textContent = skill ? (index < 2 ? "Critical" : index < 4 ? "Important" : "Nice to have") : "";
      }
    });
  }

  const recommendedCard = page.querySelectorAll(".card")[2];
  if (recommendedCard) {
    const headerTitle = recommendedCard.querySelector(".card-title");
    if (headerTitle) headerTitle.textContent = hasResume ? "Recommended Jobs" : "Recommended Jobs";
    const jobs = hasResume ? (careerData.eligible || []).slice(0, 3) : [];
    const fallbackJobs = matches.slice(0, 3);
    const jobCards = hasResume ? (jobs.length ? jobs : fallbackJobs) : [];
    const jobsGrid = recommendedCard.querySelector(".grid3");
    if (jobsGrid) {
      jobsGrid.innerHTML = jobCards.length
        ? jobCards.map((job) => {
          const role = escapeHtml(job.role || job.title || "Resume-aligned role");
          const match = Number.isFinite(job.match) ? Math.round(job.match) : 0;
          const tags = normalizeList(job.missing_skills || []).slice(0, 3);
          const tagHtml = tags.length
            ? tags.map((tag) => `<span class="tag tag-purple">${escapeHtml(tag)}</span>`).join("")
            : `<span class="tag tag-green">Eligible</span>`;
          const matchColor = match >= 80 ? "var(--accent3)" : match >= 60 ? "var(--accent4)" : "var(--accent2)";
          return `
            <div class="job-card">
              <div class="job-card-header">
                <div><div class="job-role">${role}</div><div class="job-company">Tailored to your uploaded resume</div></div>
                <div class="job-match" style="color:${matchColor};">${match}%</div>
              </div>
              <div class="job-tags">
                <span class="tag ${match >= 80 ? 'tag-green' : match >= 60 ? 'tag-orange' : 'tag-red'}">${match >= 80 ? 'Eligible' : match >= 60 ? 'Near eligible' : 'Needs work'}</span>
                ${tagHtml}
              </div>
            </div>`;
        }).join("")
        : `<div style="color:var(--text3);font-size:13px;">Upload a resume to see personalized job matches.</div>`;
    }
  }
}

function renderExplorer(state) {
  const page = document.getElementById("page-explorer");
  if (!page) return;

  const careerData = state.career_data || { eligible: [], nearly_eligible: [], not_ready: [] };
  const jobData = state.job_data || { matches: [] };
  const resumeData = state.resume_data || {};
  const skills = state.skills || [];
  const atsData = state.ats_data || state.base_ats_data || null;
  const atsScore = Number(atsData?.score ?? 0);
  const uploadedLabel = resumeData.name || state.generated_resume?.name || "Not uploaded";

  const title = page.querySelector(".page-title");
  const sub = page.querySelector(".page-sub");
  if (title) title.textContent = "Resume Analyzer";
  if (sub) sub.textContent = state.skills.length ? `${skills.length} skills extracted from ${resumeData.name || 'your resume'} are mapped to roles` : "Upload a resume to populate this page";

  const careerStatus = document.getElementById("career-upload-status");
  if (careerStatus) {
    careerStatus.textContent = state.raw_text
      ? `Present uploaded resume: ${uploadedLabel} • ATS Score: ${Number.isFinite(atsScore) ? atsScore : 0}`
      : "Present uploaded resume: none";
  }

  const careerFileName = document.getElementById("career-uploaded-file-name");
  if (careerFileName) {
    careerFileName.textContent = uploadedLabel;
  }

  const statCards = page.querySelectorAll(".stat-card");
  const eligible = careerData.eligible || [];
  const nearly = careerData.nearly_eligible || [];
  const gap = careerData.not_ready || [];
  if (statCards[0]) statCards[0].querySelector(".stat-value").textContent = state.raw_text ? String(Number.isFinite(atsScore) ? Math.round(atsScore) : 0) : "";
  if (statCards[1]) statCards[1].querySelector(".stat-value").textContent = state.skills.length ? String(eligible.length) : "";
  if (statCards[2]) statCards[2].querySelector(".stat-value").textContent = state.skills.length ? String(nearly.length) : "";
  if (statCards[3]) statCards[3].querySelector(".stat-value").textContent = state.skills.length ? String(gap.length) : "";

  const tiers = page.querySelectorAll(".career-tier");
  const fillTier = (tier, items, emptyLabel) => {
    if (!tier) return;
    const titleEl = tier.querySelector(".tier-count");
    const rolesEl = tier.querySelector(".tier-roles");
    if (titleEl) titleEl.textContent = `${items.length} roles available`;
    if (rolesEl) {
      rolesEl.innerHTML = items.length
        ? items.slice(0, 8).map((item) => `<span class="tag ${tier.classList.contains('tier-eligible') ? 'tag-green' : tier.classList.contains('tier-near') ? 'tag-orange' : 'tag-red'}">${escapeHtml(item.role || item.title || item)}</span>`).join("")
        : `<span class="tag tag-purple">${escapeHtml(emptyLabel)}</span>`;
    }
  };

  fillTier(tiers[0], state.skills.length ? eligible : [], "");
  fillTier(tiers[1], state.skills.length ? nearly : [], "");
  fillTier(tiers[2], state.skills.length ? gap : [], "");

  const topJobsCard = page.querySelector(".card:last-of-type");
  if (topJobsCard) {
    const jobs = (jobData.matches || []).slice(0, 3);
    const container = topJobsCard.querySelector("div[style*='display:flex;flex-direction:column;gap:8px;']");
    if (container) {
      container.innerHTML = jobs.length
        ? jobs.map((job) => {
            const match = Math.round(job.match || 0);
            const missing = normalizeList(job.missing_skills || []).slice(0, 3);
            return `
              <div class="job-card">
                <div class="job-card-header">
                  <div><div class="job-role">${escapeHtml(job.role || 'Role match')}</div><div class="job-company" style="margin-top:3px;">Tailored from your resume skills</div></div>
                  <div class="job-match" style="color:${match >= 80 ? 'var(--accent3)' : match >= 60 ? 'var(--accent4)' : 'var(--accent2)'};">${match}%</div>
                </div>
                <div class="job-tags">
                  <span class="tag ${match >= 80 ? 'tag-green' : match >= 60 ? 'tag-orange' : 'tag-red'}">${match >= 80 ? 'Eligible' : match >= 60 ? 'Near eligible' : 'Needs work'}</span>
                  ${missing.map((skill) => `<span class="tag tag-purple">${escapeHtml(skill)}</span>`).join("")}
                </div>
              </div>`;
          }).join("")
        : `<div style="color:var(--text3);font-size:13px;">Upload a resume to see matching roles.</div>`;
    }
  }
}

function renderMarket(state) {
  const page = document.getElementById("page-market");
  if (!page) return;

  const resumeData = state.resume_data || {};
  const skills = normalizeList(state.skills || []);
  const jobData = state.job_data || { matches: [] };
  const optData = state.opt_data || { added_keywords: [] };
  const careerData = state.career_data || { eligible: [], nearly_eligible: [], not_ready: [] };

  const title = page.querySelector(".page-title");
  const sub = page.querySelector(".page-sub");
  if (title) title.textContent = "Resume Market Fit";
  if (sub) sub.textContent = state.skills.length ? `Skills and roles inferred from ${resumeData.name || 'your resume'}` : "Upload a resume to populate this page";

  const cards = page.querySelectorAll(".card");
  const strongestSkills = skills.slice(0, 6);
  const gaps = normalizeList(optData.added_keywords || []).slice(0, 6);
  const topMatches = (jobData.matches || []).slice(0, 4);

  if (cards[0]) {
    cards[0].innerHTML = `
      <div class="card-title">Strongest Skills Detected</div>
      ${strongestSkills.length ? strongestSkills.map((skill, index) => {
        const pct = Math.max(55, 95 - index * 8);
        return `
          <div class="market-row">
            <div><div class="market-skill">${escapeHtml(skill)}</div><div class="market-demand">Found in your resume</div></div>
            <div style="display:flex;align-items:center;gap:8px;">
              <div class="mini-chart">
                <div class="mini-bar accent" style="height:${Math.max(40, pct - 35)}%"></div>
                <div class="mini-bar" style="height:${Math.max(45, pct - 25)}%"></div>
                <div class="mini-bar accent" style="height:${Math.max(55, pct - 15)}%"></div>
                <div class="mini-bar" style="height:100%"></div>
              </div>
              <div class="market-trend" style="color:var(--accent3);">${pct}%</div>
            </div>
          </div>`;
      }).join("") : `<div style="color:var(--text3);font-size:13px;">Upload a resume to see extracted skills here.</div>`}
    `;
  }

  if (cards[1]) {
    cards[1].innerHTML = `
      <div class="card-title">Skills to Learn Next</div>
      <div style="font-size:12px;color:var(--text3);margin-bottom:12px;">Prioritized from your resume gaps</div>
      ${gaps.length ? gaps.map((skill, index) => {
        const pct = Math.max(10, 35 - index * 6);
        return `
          <div class="skill-row">
            <div class="skill-name">${escapeHtml(skill)}</div>
            <div class="skill-bar-bg"><div class="skill-bar-fill animated-bar" style="width:${pct}%;background:var(--accent2);animation-delay:${index * 0.05}s;"></div></div>
            <div class="skill-pct" style="color:var(--accent2);">${pct}%</div>
          </div>`;
      }).join("") : `<div style="color:var(--text3);font-size:13px;">Upload a resume to see skill gaps here.</div>`}
    `;
  }

  if (cards[2]) {
    const roleCards = topMatches.length ? topMatches : (careerData.eligible || []).slice(0, 4);
    cards[2].innerHTML = `
      <div class="card-title">Personalized Role Outlook</div>
      <div class="grid4" style="grid-template-columns:repeat(4,1fr);gap:1rem;">
        ${roleCards.length ? roleCards.map((job) => `
          <div style="text-align:center;padding:1rem;background:var(--surface2);border-radius:10px;">
            <div style="font-size:12px;color:var(--text3);margin-bottom:6px;">${escapeHtml(job.role || 'Role')}</div>
            <div style="font-family:'Syne',sans-serif;font-size:18px;font-weight:700;color:var(--accent);">${Math.round(job.match || 0)}%</div>
            <div style="font-size:11px;color:var(--accent3);margin-top:4px;">Resume match</div>
          </div>`).join("") : `<div style="color:var(--text3);font-size:13px;">Upload a resume to see role matches.</div>`}
      </div>
    `;
  }
}

function renderBuilder(state) {
  const page = document.getElementById("page-builder") || document.getElementById("page-create");
  if (!page) return;

  const resumeData = state.generated_resume || state.resume_data || {};
  const skills = normalizeList(state.generated_resume?.skills || state.skills || []);
  const name = resumeData.name || "";

  const nameInput = document.getElementById("builder-name");
  const emailInput = document.getElementById("builder-email");
  const phoneInput = document.getElementById("builder-phone");
  const linkedinInput = document.getElementById("builder-linkedin");
  const githubInput = document.getElementById("builder-github");
  const portfolioInput = document.getElementById("builder-portfolio");
  const summaryInput = document.getElementById("builder-summary");
  const courseworkInput = document.getElementById("builder-coursework");
  const educationInput = document.getElementById("builder-education-input");
  const projectsInput = document.getElementById("builder-projects-input");
  const experienceInput = document.getElementById("builder-experience-input");
  const certificationsInput = document.getElementById("builder-certifications-input");
  const achievementsInput = document.getElementById("builder-achievements-input");
  const template = RESUME_TEMPLATES.includes(state.resume_template) ? state.resume_template : "jonathan";
  if (nameInput) nameInput.value = name;
  if (emailInput) emailInput.value = resumeData.email || "";
  if (phoneInput) phoneInput.value = resumeData.phone || "";
  if (linkedinInput) linkedinInput.value = resumeData.linkedin || "";
  if (githubInput) githubInput.value = resumeData.github || "";
  if (portfolioInput) portfolioInput.value = resumeData.portfolio || "";
  if (summaryInput) summaryInput.value = resumeData.summary || "";
  if (courseworkInput) {
    const coursework = Array.isArray(resumeData.coursework)
      ? resumeData.coursework.join(", ")
      : String(resumeData.coursework || "");
    courseworkInput.value = coursework;
  }
  if (educationInput) educationInput.value = normalizeList(resumeData.education).join("\n");
  const existingProjectObjects = getStructuredProjectsFromSource(resumeData.projects, state.raw_text || "");
  const typedProjectLines = getTextAreaLines("builder-projects-input");
  const builderProjectSource = typedProjectLines.length ? typedProjectLines : existingProjectObjects;
  const builderProjects = builderProjectSource.length
    ? getStructuredProjectsFromSource(builderProjectSource, "")
    : parseStructuredProjects(state.raw_text || "", []);
  if (projectsInput && !projectsInput.value.trim()) {
    projectsInput.value = (builderProjectSource.length && typeof builderProjectSource[0] === "object")
      ? projectsToEditableLines(builderProjectSource).join("\n")
      : normalizeList(resumeData.projects).join("\n");
  }
  if (experienceInput) experienceInput.value = normalizeList(resumeData.experience).join("\n");
  if (certificationsInput) certificationsInput.value = normalizeList(resumeData.certifications).join("\n");
  if (achievementsInput) achievementsInput.value = normalizeList(resumeData.achievements).join("\n");

  const profileTypeInput = document.getElementById("builder-profile-type");
  if (profileTypeInput) {
    profileTypeInput.value = resumeData.profile_type || profileTypeInput.value || "fresher";
  }
  updateResumeRequirementsHint();

  renderSkillsChips(document.getElementById("skills-list"), skills, "No skills extracted yet", { removable: true });
  const builderExperienceList = document.getElementById("builder-experience-list");
  if (builderExperienceList) {
    builderExperienceList.innerHTML = renderStructuredSimpleCards(
      normalizeExperienceInputLines(resumeData.experience || []),
      ["title", "company", "duration", "impact"],
      "Experience",
      "Upload a resume to extract experience",
      { sectionKey: "experience", enableDelete: true, enableEdit: true }
    );
  }
  const builderCertificationsList = document.getElementById("builder-certifications-list");
  if (builderCertificationsList) {
    builderCertificationsList.innerHTML = renderStructuredSimpleCards(
      normalizeCertificationInputLines(resumeData.certifications || []),
      ["name", "details", "date", "link"],
      "Certification",
      "Add certification details",
      { sectionKey: "certification", enableDelete: true, enableEdit: true }
    );
  }
  const builderAchievementsList = document.getElementById("builder-achievements-list");
  if (builderAchievementsList) {
    builderAchievementsList.innerHTML = renderStructuredSimpleCards(
      normalizeAchievementInputLines(resumeData.achievements || []),
      ["title", "context", "year"],
      "Achievement",
      "Add achievements or extra activities",
      { sectionKey: "achievement", enableDelete: true, enableEdit: true }
    );
  }
  const builderEducationList = document.getElementById("builder-education-list");
  if (builderEducationList) {
    builderEducationList.innerHTML = renderStructuredEducationCards(resumeData.education, "Upload a resume to extract education", { enableDelete: true, enableEdit: true });
  }
  const builderProjectsList = document.getElementById("builder-projects-list");
  if (builderProjectsList) {
    builderProjectsList.innerHTML = renderStructuredProjectCards(builderProjects, "", { enableDelete: true, enableEdit: true });
  }

  document.querySelectorAll("#resume-template-selector, #resume-template-selector-shared").forEach((selector) => {
    selector.innerHTML = renderTemplateSelector(template);
  });

  const renderedPreview = renderResumeTemplatePreview(
    {
      ...resumeData,
      name: name || resumeData.name || "Your Name",
    },
    skills,
    template,
    state.raw_text || ""
  );

  const hasJdInput = Boolean(
    String(document.getElementById("builder-jd-text")?.value || "").trim()
    || String(document.getElementById("jd-text")?.value || "").trim()
  );
  const shouldHideBuilderPreview = page.id === "page-builder" && !hasJdInput;

  document.querySelectorAll("#tab-preview .resume-preview, #tab-preview-shared .resume-preview").forEach((preview) => {
    preview.className = `resume-preview template-${template}`;
    preview.style.cssText = "";
    preview.innerHTML = shouldHideBuilderPreview ? "" : renderedPreview;
  });
}

function renderLearning(state) {
  const page = document.getElementById("page-learning");
  if (!page) return;

  const resumeData = state.resume_data || {};
  const jobData = state.job_data || { matches: [] };
  const atsData = state.ats_data || null;
  const title = page.querySelector(".page-title");
  const sub = page.querySelector(".page-sub");
  if (title) title.textContent = "Jobs for You";
  if (sub) sub.textContent = state.skills.length ? `All jobs matched to ${resumeData.name || 'your resume'} are listed below` : "Upload a resume to populate this page";

  const jobs = (jobData.matches || [])
    .slice()
    .sort((a, b) => (Number(b.match) || 0) - (Number(a.match) || 0));

  const shell = document.getElementById("jobs-for-you-shell");
  if (!shell) return;

  if (!state.skills.length) {
    shell.innerHTML = `<div class="card"><div style="color:var(--text3);font-size:13px;">Upload a resume to see jobs matched to your profile.</div></div>`;
    return;
  }

  const eligible = jobs.filter((job) => (Number(job.match) || 0) >= 70);
  const nearly = jobs.filter((job) => (Number(job.match) || 0) >= 40 && (Number(job.match) || 0) < 70);
  const low = jobs.filter((job) => (Number(job.match) || 0) < 40);

  const buildSourceLinks = (job) => {
    const role = (job.role || job.title || "Job").trim();
    const query = encodeURIComponent(`${role} jobs`);

    return [
      { label: "Indeed", url: `https://in.indeed.com/jobs?q=${query}` },
      { label: "Glassdoor", url: `https://www.glassdoor.co.in/Job/jobs.htm?sc.keyword=${query}` },
      { label: "LinkedIn", url: `https://www.linkedin.com/jobs/search/?keywords=${query}` },
      { label: "Unstop", url: `https://unstop.com/jobs?search=${query}` }
    ];
  };

  const renderJobCard = (job) => {
    const match = Math.round(job.match || 0);
    const missing = normalizeList(job.missing_skills || []).slice(0, 4);
    const recommendations = job.recommendations || {};
    const sourceLinks = buildSourceLinks(job);
    const matchColor = match >= 80 ? 'var(--accent3)' : match >= 60 ? 'var(--accent4)' : 'var(--accent2)';
    const badgeClass = match >= 80 ? 'tag-green' : match >= 60 ? 'tag-orange' : 'tag-red';
    const badgeLabel = match >= 80 ? 'Best fit' : match >= 60 ? 'Near match' : 'Needs work';
    const tags = missing.length
      ? missing.map((skill) => `<span class="tag tag-purple">${escapeHtml(skill)}</span>`).join("")
      : `<span class="tag tag-green">Ready now</span>`;
    return `
      <div class="job-card">
        <div class="job-card-header">
          <div>
            <div class="job-role">${escapeHtml(job.role || job.title || 'Job')}</div>
            <div class="job-company" style="margin-top:3px;">Open this role on Indeed, Glassdoor, LinkedIn, or Unstop</div>
          </div>
          <div class="job-match" style="color:${matchColor};">${match}%</div>
        </div>
        <div style="font-size:12px;color:var(--text3);margin-bottom:6px;">${escapeHtml((recommendations && Object.keys(recommendations).length ? 'Recommended because it aligns with your current skills' : 'Matched from your resume skills'))}</div>
        <div class="job-tags">
          <span class="tag ${badgeClass}">${badgeLabel}</span>
          ${tags}
        </div>
        ${""}
        <div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:8px;">
          ${sourceLinks.map((source) => `<a href="${source.url}" target="_blank" rel="noopener noreferrer" class="btn btn-ghost" style="font-size:12px;padding:6px 10px;text-decoration:none;">${source.label}</a>`).join("")}
        </div>
      </div>`;
  };

  shell.innerHTML = `
    <div class="grid4 section-gap" style="grid-template-columns:repeat(3,1fr);">
      <div class="stat-card" style="border-color:rgba(67,233,123,0.3);">
        <div class="stat-label">Best Matches</div>
        <div class="stat-value" style="color:var(--accent3);">${eligible.length}</div>
        <div style="font-size:11px;color:var(--text3);margin-top:4px;">Match ≥ 70%</div>
      </div>
      <div class="stat-card" style="border-color:rgba(247,151,30,0.3);">
        <div class="stat-label">Near Matches</div>
        <div class="stat-value" style="color:var(--accent4);">${nearly.length}</div>
        <div style="font-size:11px;color:var(--text3);margin-top:4px;">Match 40–69%</div>
      </div>
      <div class="stat-card" style="border-color:rgba(255,101,132,0.3);">
        <div class="stat-label">Lower Matches</div>
        <div class="stat-value" style="color:var(--accent2);">${low.length}</div>
        <div style="font-size:11px;color:var(--text3);margin-top:4px;">Match &lt; 40%</div>
      </div>
    </div>

    <div class="card section-gap">
      <div class="flex-between mb-md">
        <div class="card-title" style="margin-bottom:0;">All Jobs Matched To You</div>
        <button class="btn btn-ghost" style="font-size:12px;padding:6px 12px;">${jobs.length} jobs</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${jobs.length ? jobs.map(renderJobCard).join("") : `<div style="color:var(--text3);font-size:13px;">No jobs matched yet.</div>`}
      </div>
    </div>
  `;
}

function renderSettings(state) {
  const profile = state?.profile || loadProfileState();
  const nameEl = document.getElementById("settings-user-name");
  const emailEl = document.getElementById("settings-user-email");
  if (nameEl) nameEl.textContent = profile.name || "Not set";
  if (emailEl) emailEl.textContent = profile.email || "Not set";
}

function renderAllPages(state) {
  renderDashboard(state);
  renderExplorer(state);
  renderProfile(state);
  renderMarket(state);
  renderBuilder(state);
  renderLearning(state);
  renderSettings(state);
  renderGlobalAiAssistant(state);
}

function setAiSuggestionContext(page, fieldId = "") {
  appState.ai_context = {
    page: String(page || appState.current_page || "dashboard"),
    fieldId: String(fieldId || ""),
    updatedAt: Date.now(),
  };
  savePersistentAppState();
  renderGlobalAiAssistant(appState);
}

function toggleGlobalAiAssistant() {
  appState.ai_assistant_open = !appState.ai_assistant_open;
  savePersistentAppState();
  renderGlobalAiAssistant(appState);
}

function setGlobalAiAssistantPosition(position = {}) {
  const nextPosition = {
    right: Number.isFinite(Number(position.right)) ? Number(position.right) : 18,
    bottom: Number.isFinite(Number(position.bottom)) ? Number(position.bottom) : 18,
  };
  appState.ai_assistant_position = nextPosition;
  savePersistentAppState();
  renderGlobalAiAssistant(appState);
}

function attachGlobalAiAssistantDrag(shell, card) {
  if (!shell) return;
  const dragClassTarget = card || shell;

  const collapsedHandle = shell.querySelector(".global-ai-assistant-icon-only");
  if (!collapsedHandle) return;

  let dragging = false;
  let startX = 0;
  let startY = 0;
  let startRight = 18;
  let startBottom = 18;
  let pointerId = null;
  let dragMoved = false;

  const isInteractiveTarget = (target) => Boolean(target?.closest("button, input, textarea, select, a, [contenteditable='true']"));

  const onPointerMove = (event) => {
    if (!dragging || (pointerId !== null && event.pointerId !== pointerId)) return;
    const dx = startX - event.clientX;
    const dy = startY - event.clientY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      dragMoved = true;
    }
    const nextRight = Math.max(12, startRight + dx);
    const nextBottom = Math.max(12, startBottom + dy);
    shell.style.right = `${nextRight}px`;
    shell.style.bottom = `${nextBottom}px`;
    shell.style.left = "auto";
    shell.style.top = "auto";
  };

  const stopDrag = () => {
    if (!dragging) return;
    dragging = false;
    pointerId = null;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", stopDrag);
    window.removeEventListener("pointercancel", stopDrag);
    if (dragMoved) {
      const right = parseFloat(shell.style.right) || 18;
      const bottom = parseFloat(shell.style.bottom) || 18;
      setGlobalAiAssistantPosition({ right, bottom });
    }
    dragClassTarget.classList.remove("is-dragging");
  };

  const startDrag = (event) => {
    if (isInteractiveTarget(event.target) && !event.target.closest(".global-ai-assistant-icon-only")) return;
    dragging = true;
    dragMoved = false;
    startX = event.clientX;
    startY = event.clientY;
    startRight = parseFloat(shell.style.right) || 18;
    startBottom = parseFloat(shell.style.bottom) || 18;
    dragClassTarget.classList.add("is-dragging");
    pointerId = event.pointerId;
    (event.currentTarget || event.target).setPointerCapture?.(event.pointerId);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stopDrag);
    window.addEventListener("pointercancel", stopDrag);
  };

  if (collapsedHandle) {
    collapsedHandle.addEventListener("pointerdown", (event) => {
      startDrag(event);
      const suppressClick = () => {
        if (dragMoved) {
          event.preventDefault();
          event.stopPropagation();
        }
        collapsedHandle.removeEventListener("click", suppressClick, true);
      };
      collapsedHandle.addEventListener("click", suppressClick, true);
    });
  }
}

function buildBestSummaryText(state) {
  const ats = state.ats_data || {};
  const resumeData = state.generated_resume || state.resume_data || {};
  const draft = getBuilderResumeDraft();
  const profileType = draft.profileType || resumeData.profile_type || "fresher";
  const role = String((state.job_data?.matches || [])[0]?.role || "").trim();
  const topSkills = (draft.skills?.length ? draft.skills : normalizeList(state.skills || []))
    .slice(0, 5)
    .filter(Boolean);
  const experienceCount = (draft.experience?.length || normalizeList(resumeData.experience || []).length || 0);
  const projectCount = (draft.projects?.length || normalizeList(resumeData.projects || []).length || 0);
  const keywordHints = normalizeList([...(ats.matched_keywords || []), ...(ats.missing_keywords || [])])
    .slice(0, 2)
    .filter(Boolean);

  const skillsPhrase = topSkills.length
    ? topSkills.join(", ")
    : "software development, APIs, and problem solving";
  const rolePhrase = role ? `${role} opportunities` : "software engineering opportunities";
  const keywordPhrase = keywordHints.length ? ` with focus on ${keywordHints.join(" and ")}` : "";
  const impactPhrase = Math.max(projectCount, experienceCount)
    ? `backed by ${projectCount || 2} projects and ${experienceCount || 1} experience entries`
    : "backed by practical project work";

  if (profileType === "professional") {
    return `Results-driven professional with proven experience delivering scalable, reliable solutions across cross-functional teams. Strong expertise in ${skillsPhrase}${keywordPhrase}, with a track record of owning end-to-end execution and improving measurable business and technical outcomes. Ready to contribute immediate impact in ${rolePhrase} through clear communication, quality-focused delivery, and continuous optimization.`;
  }

  return `Motivated early-career candidate with strong foundations in ${skillsPhrase}${keywordPhrase}, ${impactPhrase}. Demonstrated ability to build clean, maintainable solutions, learn quickly, and deliver measurable improvements in real-world scenarios. Eager to contribute and grow in ${rolePhrase} with ownership, consistency, and results-oriented execution.`;
}

function extractProjectContext(state) {
  const resumeData = state.generated_resume || state.resume_data || {};
  const draft = getBuilderResumeDraft();
  const projectItems = draft.projects?.length
    ? draft.projects
    : normalizeList(resumeData.projects || []);
  const rawProject = String(projectItems[0] || "Resume Optimization Platform").trim();

  const projectName = rawProject
    .replace(/^[-•\s]+/, "")
    .split(/[:\-|—\(]/)[0]
    .trim()
    .split(/\s+/)
    .slice(0, 8)
    .join(" ") || "Resume Optimization Platform";

  const knownStack = [
    "Python", "JavaScript", "TypeScript", "Java", "C++", "C#", "SQL", "HTML", "CSS",
    "React", "Node.js", "FastAPI", "Django", "Flask", "Angular", "Vue", "MongoDB", "PostgreSQL", "MySQL"
  ];

  const skillsPool = [
    ...normalizeList(draft.skills || []),
    ...normalizeList(state.skills || []),
    rawProject,
  ].join(" ").toLowerCase();

  const languages = knownStack
    .filter((tech) => skillsPool.includes(tech.toLowerCase()))
    .slice(0, 3);

  return {
    name: projectName,
    languages,
  };
}

function buildProjectSpecificLine(state) {
  const projectCtx = extractProjectContext(state);
  const stackText = projectCtx.languages.length
    ? projectCtx.languages.join(", ")
    : "modern web technologies";

  return `Developed ${projectCtx.name} using ${stackText}, designed modular features, and delivered measurable improvements in usability, performance, reliability, and maintainability.`;
}

function getProfileFieldSuggestion(fieldId, state) {
  const topRole = String((state.job_data?.matches || [])[0]?.role || "Software Engineer").trim();
  const topSkills = normalizeList(state.skills || []).slice(0, 6);

  if (fieldId === "profile-summary") {
    return {
      title: "Best Profile Summary",
      location: "Profile Summary",
      action: buildBestSummaryText(state),
      target: { type: "profile-field-apply", fieldId: "profile-summary", mode: "replace" },
      cta: "Generate Best Summary",
    };
  }

  if (fieldId === "profile-projects") {
    return {
      title: "Best Project Description",
      location: "Profile Projects",
      action: buildProjectSpecificLine(state),
      target: { type: "profile-field-apply", fieldId: "profile-projects", mode: "append" },
      cta: "Use in Projects",
    };
  }

  if (fieldId === "profile-experience") {
    const focus = topSkills[0] || "core engineering practices";
    return {
      title: "Best Experience Line",
      location: "Profile Experience",
      action: `Delivered end-to-end features using ${focus}, collaborated across teams, and improved delivery quality with measurable outcomes in performance and reliability.`,
      target: { type: "profile-field-apply", fieldId: "profile-experience", mode: "append" },
      cta: "Use in Experience",
    };
  }

  if (fieldId === "profile-education") {
    return {
      title: "Best Education Line",
      location: "Profile Education",
      action: "Completed a strong academic foundation with relevant coursework, practical projects, and consistent performance aligned to software engineering roles.",
      target: { type: "profile-field-apply", fieldId: "profile-education", mode: "append" },
      cta: "Use in Education",
    };
  }

  if (fieldId === "profile-skills") {
    const skillLine = topSkills.length ? topSkills.join("\n") : "Python\nJavaScript\nSQL\nGit\nREST APIs";
    return {
      title: "Best Skills Set",
      location: "Profile Skills",
      action: skillLine,
      target: { type: "profile-field-apply", fieldId: "profile-skills", mode: "replace" },
      cta: "Use in Skills",
    };
  }

  if (fieldId === "profile-role") {
    return {
      title: "Best Role Title",
      location: "Profile Role",
      action: topRole || "Software Engineer",
      target: { type: "profile-field-apply", fieldId: "profile-role", mode: "replace" },
      cta: "Use Role",
    };
  }

  return null;
}

function getBuilderFieldSuggestion(fieldId, state) {
  const ats = state.ats_data || {};
  const topKeyword = normalizeList(ats.missing_keywords || [])[0] || "role-specific keyword";
  const topSkills = normalizeList(state.skills || []).slice(0, 3);

  if (fieldId === "builder-summary") {
    const bestSummary = buildBestSummaryText(state);
    return {
      title: "Best Professional Summary",
      location: "Professional Summary",
      action: bestSummary,
      target: { type: "builder-field-apply", fieldId: "builder-summary", mode: "replace" },
      cta: "Generate Best Summary",
    };
  }

  if (fieldId === "builder-experience-input") {
    const focus = topSkills[0] || topKeyword;
    return {
      title: "Best Experience Bullet",
      location: "Experience Highlights",
      action: `Delivered end-to-end features using ${focus}, improved release reliability, and increased execution speed through measurable process and quality improvements.`,
      target: { type: "builder-field-apply", fieldId: "builder-experience-input", mode: "append" },
      cta: "Use in Experience",
    };
  }

  if (fieldId === "builder-projects-input") {
    return {
      title: "Best Project Bullet",
      location: "Projects",
      action: buildProjectSpecificLine(state),
      target: { type: "builder-field-apply", fieldId: "builder-projects-input", mode: "append" },
      cta: "Use in Projects",
    };
  }

  if (fieldId === "builder-education-input") {
    return {
      title: "Best Education Line",
      location: "Education Details",
      action: "Completed a strong academic foundation with relevant coursework, hands-on projects, and practical outcomes aligned to target software roles.",
      target: { type: "builder-field-apply", fieldId: "builder-education-input", mode: "append" },
      cta: "Use in Education",
    };
  }

  if (fieldId === "new-skill") {
    return {
      title: "Skill suggestion",
      location: "Skills",
      action: topKeyword,
      target: { type: "builder-field-apply", fieldId: "new-skill", mode: "skill" },
      cta: "Add Skill",
    };
  }

  return null;
}

function getActivePageId() {
  const activePage = document.querySelector(".page.active");
  if (!activePage?.id) return "dashboard";
  return activePage.id.replace(/^page-/, "") || "dashboard";
}

function buildGlobalAiSuggestion(state, pageId) {
  const activeContext = state.ai_context || { page: pageId, fieldId: "" };
  const ats = state.ats_data || {};
  const missingKeywords = normalizeList(ats.missing_keywords || []);
  const topKeyword = missingKeywords[0] || "";
  const topJob = (state.job_data?.matches || [])[0] || {};
  const topMissingSkill = normalizeList(topJob.missing_skills || state.opt_data?.added_keywords || [])[0] || "";
  const builderSuggestions = buildBuilderAiSuggestions(state);
  const builderPrimary = builderSuggestions[0] || null;

  if (!state.raw_text) {
    return {
      title: "Start with resume upload",
      location: "Resume Analyzer upload zone",
      action: "Upload your resume to unlock personalized ATS and job-match suggestions.",
      target: { type: "navigate", page: "analyzer" },
      cta: "Open Analyzer",
    };
  }

  if (pageId === "builder" && activeContext.fieldId) {
    const fieldSuggestion = getBuilderFieldSuggestion(activeContext.fieldId, state);
    if (fieldSuggestion) return fieldSuggestion;
  }

  if (pageId === "profile" && activeContext.fieldId) {
    const profileSuggestion = getProfileFieldSuggestion(activeContext.fieldId, state);
    if (profileSuggestion) return profileSuggestion;
  }

  if (pageId === "analyzer") {
    if (topKeyword) {
      return {
        title: `Add keyword: ${topKeyword}`,
        location: "ATS Data To Change editor",
        action: `Implemented ${topKeyword} in production workflow and improved measurable outcomes in delivery speed, quality, and system reliability.`,
        target: { type: "analyzer-insert", text: `Implemented ${topKeyword} in production workflow and improved measurable outcomes.` },
        cta: "Use Here",
      };
    }
    return {
      title: "Strengthen impact",
      location: "ATS editable resume lines",
      action: "Rewrite one weak bullet with action + metric (%, users, time saved) and re-analyze.",
      target: { type: "analyzer-insert", text: "Delivered measurable impact by improving process efficiency and reducing turnaround time by 25%." },
      cta: "Use Here",
    };
  }

  if (pageId === "builder") {
    if (builderPrimary) {
      return {
        title: builderPrimary.title || "Builder enhancement",
        location: builderPrimary.location || "Resume Builder",
        action: builderPrimary.action || "Delivered role-focused improvements with measurable project and execution outcomes.",
        target: { type: "builder-apply", title: builderPrimary.title, location: builderPrimary.location, action: builderPrimary.action },
        cta: "Use Here",
      };
    }
    return {
      title: "Improve summary",
      location: "Builder Summary field",
      action: "Add a concise summary with role, top tools, and one measurable achievement.",
      target: { type: "builder-apply", title: "Improve summary", location: "Builder Summary", action: "Results-driven candidate with strong execution across projects, role-relevant tools, and measurable outcomes." },
      cta: "Use Here",
    };
  }

  if (pageId === "learning") {
    if (topMissingSkill) {
      return {
        title: `Add skill evidence: ${topMissingSkill}`,
        location: "Builder Skills + Experience bullets",
        action: `Applied ${topMissingSkill} in practical delivery work and produced measurable gains in quality, performance, and execution consistency.`,
        target: { type: "builder-apply", title: `Add ${topMissingSkill}`, location: "Skills and Experience", action: `Used ${topMissingSkill} in project delivery to improve quality and timeline outcomes.` },
        cta: "Use Here",
      };
    }
    return {
      title: "Raise job match",
      location: "Learning page job recommendations",
      action: "Open Builder and add one job-aligned bullet to Experience or Projects.",
      target: { type: "navigate", page: "builder", tab: "build" },
      cta: "Open Builder",
    };
  }

  if (pageId === "market") {
    if (topMissingSkill) {
      return {
        title: `Market gap: ${topMissingSkill}`,
        location: "Skills to Learn Next",
        action: `Implemented ${topMissingSkill} in a role-aligned project and demonstrated measurable impact to improve market match and role eligibility.`,
        target: { type: "builder-apply", title: `Add ${topMissingSkill}`, location: "Skills and Projects", action: `Implemented ${topMissingSkill} in a project to increase performance and delivery confidence.` },
        cta: "Use Here",
      };
    }
    return {
      title: "Increase market fit",
      location: "Role outlook section",
      action: "Add one high-demand keyword in Summary and one related project bullet.",
      target: { type: "navigate", page: "builder", tab: "build" },
      cta: "Open Builder",
    };
  }

  if (pageId === "settings") {
    return {
      title: "Keep profile consistent",
      location: "Settings account details",
      action: "Profile identity is aligned: keep name, email, and role title consistent with resume header for cleaner applications and ATS records.",
      target: { type: "navigate", page: "settings" },
      cta: "Open Settings",
    };
  }

  if (topKeyword) {
    return {
      title: "Improve ATS match",
      location: "ATS + Resume Builder",
      action: `Add ${topKeyword} naturally in a role-relevant bullet and quantify the outcome.`,
      target: { type: "builder-apply", title: `Add ${topKeyword}`, location: "Experience or Projects", action: `Applied ${topKeyword} to improve delivery speed and measurable quality outcomes.` },
      cta: "Use Here",
    };
  }

  return {
    title: "Next best action",
    location: "Resume Builder",
    action: "Strengthen one section with role-specific wording and measurable impact.",
    target: { type: "navigate", page: "builder", tab: "build" },
    cta: "Open Builder",
  };
}

function renderGlobalAiAssistant(state) {
  const pageId = state.current_page || getActivePageId();
  const suggestion = buildGlobalAiSuggestion(state, pageId);
  if (!suggestion) return;
  const isOpen = Boolean(state.ai_assistant_open);
  const position = state.ai_assistant_position || { right: 18, bottom: 18 };

  let shell = document.getElementById("global-ai-assistant");
  if (!shell) {
    shell = document.createElement("aside");
    shell.id = "global-ai-assistant";
    shell.className = "global-ai-assistant";
    document.body.appendChild(shell);
  }

  shell.style.right = `${Number(position.right) || 18}px`;
  shell.style.bottom = `${Number(position.bottom) || 18}px`;
  shell.style.left = "auto";
  shell.style.top = "auto";

  if (!isOpen) {
    shell.className = "global-ai-assistant collapsed";
    shell.innerHTML = `
      <button type="button" class="global-ai-assistant-icon-only" onclick="toggleGlobalAiAssistant()" aria-label="Open AI suggestion">
        ${renderAiLogo()}
      </button>
    `;
    attachGlobalAiAssistantDrag(shell, null);
    return;
  }

  shell.className = "global-ai-assistant open";
  shell.innerHTML = `
    <div class="global-ai-assistant-card">
      <div class="global-ai-assistant-head">
        <button type="button" class="global-ai-assistant-icon-btn" onclick="toggleGlobalAiAssistant()" aria-label="Close AI suggestion">
          ${renderAiLogo()}
        </button>
        <div>
          <div class="global-ai-assistant-title">AI Suggestion</div>
          <div class="global-ai-assistant-sub">Context: ${escapeHtml(pageId)}</div>
        </div>
      </div>
      <div class="global-ai-assistant-body is-open">
        <div class="global-ai-assistant-location">${escapeHtml(suggestion.location || "Relevant section")}</div>
        <div class="global-ai-assistant-text">${escapeHtml(suggestion.action || "Apply this improvement to increase resume quality.")}</div>
        <button type="button" class="global-ai-assistant-btn">${escapeHtml(suggestion.cta || "Use Here")}</button>
      </div>
    </div>
  `;

  const card = shell.querySelector(".global-ai-assistant-card");
  const actionButton = shell.querySelector(".global-ai-assistant-btn");
  if (actionButton) {
    actionButton.addEventListener("click", () => runGlobalAiSuggestion(suggestion));
  }
  attachGlobalAiAssistantDrag(shell, card);
}

function runGlobalAiSuggestion(suggestion = null) {
  if (!suggestion || typeof suggestion !== "object") return;

  const target = suggestion?.target || {};
  if (target.type === "navigate") {
    appState.ai_assistant_open = false;
    showPage(target.page || "dashboard");
    if (target.tab) switchTab(target.tab);
    return;
  }

  if (target.type === "analyzer-insert") {
    appState.ai_assistant_open = false;
    showPage("analyzer");
    const editor = document.getElementById("ats-resume-editor");
    if (editor) {
      addSuggestionLine(String(target.text || suggestion.action || ""), -1);
      return;
    }
    applyAiSuggestionToBuilder(suggestion.title, suggestion.location, String(target.text || suggestion.action || ""));
    return;
  }

  if (target.type === "builder-apply") {
    appState.ai_assistant_open = false;
    applyAiSuggestionToBuilder(
      target.title || suggestion.title,
      target.location || suggestion.location,
      target.action || suggestion.action
    );
    return;
  }

  if (target.type === "builder-field-apply") {
    const fieldId = String(target.fieldId || "").trim();
    if (!fieldId) return;

    appState.ai_assistant_open = false;
    showPage("builder");
    switchTab("build");

    requestAnimationFrame(() => {
      const field = document.getElementById(fieldId);
      if (!field) return;

      const mode = target.mode === "skill" ? "skill" : "textarea";
      if (target.mode === "replace" && fieldId !== "new-skill") {
        field.value = String(suggestion.action || "").trim();
      } else {
        appendBuilderValue(field, String(suggestion.action || ""), mode);
      }
      field.focus();
      if (typeof field.setSelectionRange === "function" && field.value) {
        const end = field.value.length;
        field.setSelectionRange(end, end);
      }
      setAiSuggestionContext("builder", fieldId);
    });
    return;
  }

  if (target.type === "profile-field-apply") {
    const fieldId = String(target.fieldId || "").trim();
    if (!fieldId) return;

    appState.ai_assistant_open = false;
    showPage("profile");
    requestAnimationFrame(() => {
      const field = document.getElementById(fieldId);
      if (!field) return;

      const mode = target.mode === "replace" ? "replace" : "append";
      if (mode === "replace") {
        field.value = String(suggestion.action || "").trim();
      } else {
        appendBuilderValue(field, String(suggestion.action || ""), "textarea");
      }

      field.focus();
      if (typeof field.setSelectionRange === "function" && field.value) {
        const end = field.value.length;
        field.setSelectionRange(end, end);
      }
      setAiSuggestionContext("profile", fieldId);
    });
    return;
  }

  if (suggestion?.action) {
    appState.ai_assistant_open = false;
    applyAiSuggestionToBuilder(suggestion.title, suggestion.location, suggestion.action);
  }
}

function getExactSectionForKeyword(keyword, breakdown = {}) {
  const lower = String(keyword || "").toLowerCase();

  if (/(certified|certificate|certification|pmp|aws certified|azure certified|scrum master)/.test(lower)) {
    return {
      section: "Certifications",
      where: "Create Resume > Certifications",
      template: `${keyword} certification aligned to target role requirements.`
    };
  }

  if (/(objective|profile|summary|overview)/.test(lower)) {
    return {
      section: "Professional Summary",
      where: "Create Resume > Summary",
      template: `Summary updated with ${keyword} aligned to JD requirements.`
    };
  }

  if (/(lead|leadership|stakeholder|collaboration|communication|ownership|mentoring)/.test(lower)) {
    return {
      section: "Experience",
      where: "Create Resume > Experience",
      template: `Applied ${keyword} to improve team execution and delivery outcomes.`
    };
  }

  if (/(react|angular|vue|html|css|javascript|typescript|node(\.js)?|express(\.js)?|python|java|sql|api|rest\s*api|microservice|microservices|backend|frontend|postgres|postgresql|mysql|mongodb|aws|azure|gcp|docker|kubernetes|terraform|jenkins|ci\/?cd|devops|prometheus|grafana|agile|scrum|jira)/.test(lower)) {
    return {
      section: "Skills",
      where: "Create Resume > Skills",
      template: `Add ${keyword} in Skills and support it with one matching project/experience bullet.`
    };
  }

  return {
    section: "Skills",
    where: "Create Resume > Skills",
    template: `Added ${keyword} and validated it with one project/experience bullet.`
  };
}

function buildAtsMissingPlacementPlan(missingKeywords = [], missingSections = [], breakdown = {}) {
  const keywordRows = normalizeList(missingKeywords).map((keyword) => {
    const hint = getExactSectionForKeyword(keyword, breakdown);
    return {
      type: "keyword",
      label: keyword,
      section: hint.section,
      where: hint.where,
      template: hint.template,
    };
  });

  const sectionRows = normalizeList(missingSections).map((sectionName) => ({
    type: "section",
    label: `Missing section: ${sectionName}`,
    section: sectionName,
    where: `Create Resume > ${sectionName}`,
    template: `${sectionName} heading and at least 1 relevant bullet should be present.`,
  }));

  return [...keywordRows, ...sectionRows].slice(0, 14);
}

function buildAtsFallbackPlacementPlanFromMetrics(breakdown = {}) {
  const metricSectionMap = {
    keywords: { section: "Skills + Projects + Experience", where: "Create Resume > Skills, Projects, Experience", template: "Add JD terms naturally in bullets that prove real work." },
    impact: { section: "Experience + Projects", where: "Create Resume > Experience, Projects", template: "Rewrite bullets with action + measurable result (%, users, time, revenue)." },
    skills: { section: "Skills", where: "Create Resume > Skills", template: "Add role-relevant skills and map each one to proof in projects/experience." },
    sections: { section: "Summary/Education/Experience/Projects", where: "Create Resume > Build", template: "Ensure all core ATS sections are present with clear headings." },
    contact: { section: "Header Contact", where: "Create Resume > Name/Email/Phone/Links", template: "Keep email, phone, and professional links clearly visible at top." },
    formatting: { section: "Overall Resume Formatting", where: "Create Resume > Build", template: "Use concise bullets, consistent spacing, and avoid long dense paragraphs." },
  };

  const metricMax = { contact: 10, sections: 16, skills: 15, formatting: 10, impact: 10, keywords: 30 };
  const ranked = Object.entries(breakdown || {})
    .map(([metric, value]) => {
      const max = metricMax[metric] || 10;
      const ratio = max ? (Number(value) || 0) / max : 0;
      return { metric, ratio };
    })
    .sort((a, b) => a.ratio - b.ratio)
    .slice(0, 4);

  return ranked
    .map(({ metric }) => {
      const detail = metricSectionMap[metric];
      if (!detail) return null;
      return {
        type: "metric",
        label: `Weak area: ${metric.toUpperCase()}`,
        section: detail.section,
        where: detail.where,
        template: detail.template,
      };
    })
    .filter(Boolean);
}

function extractJdKeywordCandidates(jdText = "") {
  const raw = String(jdText || "").trim();
  if (!raw) return [];

  const jdLower = raw.toLowerCase();
  const knownSkills = Array.from(new Set(SOFTWARE_SKILL_CATEGORIES.flatMap((group) => group.skills || [])));
  const detectedKnown = knownSkills.filter((skill) => jdLower.includes(String(skill || "").toLowerCase()));

  const phrases = [
    "ci/cd", "microservices", "rest api", "graphql", "system design", "unit testing",
    "integration testing", "cloud", "devops", "kubernetes", "docker", "terraform",
    "jira", "agile", "scrum", "stakeholder management", "communication"
  ].filter((phrase) => jdLower.includes(phrase));

  const acronymTokens = (raw.match(/\b[A-Z]{2,}\b/g) || [])
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && token.length <= 10);

  return uniqueNormalizedLines([...detectedKnown, ...phrases, ...acronymTokens]).slice(0, 24);
}

function buildResumeDerivedPlacementPlan(state, breakdown = {}) {
  const resumeData = state.generated_resume || state.resume_data || {};
  const jdText = String(document.getElementById("ats-jd")?.value || "").trim();
  const resumeText = String(state.raw_text || "");
  const resumeSkillsText = normalizeList(resumeData.skills || state.skills || []).join(" ");
  const combinedResumeText = `${resumeText}\n${resumeSkillsText}`.toLowerCase();

  const sectionRows = [];
  if (!String(resumeData.summary || "").trim()) {
    sectionRows.push({
      type: "section",
      label: "Missing section: Professional Summary",
      section: "Professional Summary",
      where: "Create Resume > Summary",
      template: "Add a 3-4 line role-aligned summary with target skills and outcomes.",
    });
  }
  if (!normalizeList(resumeData.skills || state.skills || []).length) {
    sectionRows.push({
      type: "section",
      label: "Missing section: Skills",
      section: "Skills",
      where: "Create Resume > Skills",
      template: "Add core technical and role-specific skills from the JD.",
    });
  }
  if (!normalizeList(resumeData.experience || []).length) {
    sectionRows.push({
      type: "section",
      label: "Missing section: Experience",
      section: "Experience",
      where: "Create Resume > Experience",
      template: "Add role/impact bullets with measurable results.",
    });
  }
  if (!normalizeList(resumeData.projects || []).length) {
    sectionRows.push({
      type: "section",
      label: "Missing section: Projects",
      section: "Projects",
      where: "Create Resume > Projects",
      template: "Add 2-3 relevant projects with stack and outcomes.",
    });
  }

  const jdCandidates = extractJdKeywordCandidates(jdText);
  const missingKeywords = jdCandidates.filter((keyword) => {
    const k = String(keyword || "").toLowerCase().trim();
    return k && !combinedResumeText.includes(k);
  });

  const keywordRows = missingKeywords.map((keyword) => {
    const hint = getExactSectionForKeyword(keyword, breakdown);
    return {
      type: "keyword",
      label: keyword,
      section: hint.section,
      where: hint.where,
      template: hint.template,
    };
  });

  return [...sectionRows, ...keywordRows].slice(0, 14);
}

function renderAtsChecker(state) {
  const emptyState = document.getElementById("ats-empty-state");
  const result = document.getElementById("ats-result");
  if (!emptyState || !result) return;

  const ats = state.ats_data;
  if (!ats) {
    emptyState.style.display = "block";
    result.style.display = "none";
    result.innerHTML = "";
    return;
  }

  const score = Math.max(0, Math.min(100, Number(ats.score || 0)));
  const atsView = state.ats_view === "focus" ? "focus" : "detailed";
  const isFocusView = atsView === "focus";
  const breakdown = ats.breakdown || {};
  const recommendations = ats.recommendations || [];
  const aiRewrite = state.ai_rewrite || null;
  const aiInsights = ats.ai_insights || [];
  const evidence = ats.evidence || {};
  const matchedKeywords = ats.matched_keywords || [];
  const missingKeywords = ats.missing_keywords || [];
  const projectedScore = Number(ats.projected_score || score);
  const scoreGap = Math.max(0, Number(ats.score_gap || Math.max(0, projectedScore - score)));
  const detectedSections = ats.detected_sections || {};
  const label = ats.label || "";
  const mode = ats.mode === "job-matched" ? "Resume + JD" : "Resume readiness";
  const isJobMatched = ats.mode === "job-matched";
  const dash = 239;
  const offset = Math.max(0, dash - (dash * score) / 100);

  const sectionNames = {
    summary: "Professional Summary",
    education: "Education",
    experience: "Experience",
    projects: "Projects",
    skills: "Skills Section"
  };

  const missingSections = Object.entries(detectedSections)
    .filter(([, present]) => !present)
    .map(([name]) => sectionNames[name] || name);

  const metricMax = {
    contact: 10,
    sections: 16,
    skills: 15,
    formatting: 10,
    impact: 10,
    keywords: ats.mode === "job-matched" ? 30 : 15,
  };

  const metricDetails = {
    contact: {
      location: "Resume header (top area)",
      fix: "Add visible email, phone, and LinkedIn/GitHub at the top.",
    },
    sections: {
      location: "Summary, Skills, Experience, Projects, Education sections",
      fix: "Add missing sections and keep section headings explicit for ATS parsing.",
    },
    skills: {
      location: "Skills section + matching Experience/Projects bullets",
      fix: "Add role-relevant skills and prove each skill with one concrete bullet.",
    },
    formatting: {
      location: "Overall resume formatting",
      fix: "Use concise bullets, consistent spacing, and avoid dense paragraphs.",
    },
    impact: {
      location: "Experience and Project bullets",
      fix: "Rewrite bullets with action + measurable result (%, users, time saved, scale).",
    },
    keywords: {
      location: "Summary, Skills, Experience, Projects",
      fix: "Insert missing JD keywords naturally in relevant bullets.",
    },
  };

  const basePlacementPlan = buildAtsMissingPlacementPlan(missingKeywords, missingSections, breakdown);
  const resumeDerivedPlan = buildResumeDerivedPlacementPlan(state, breakdown);
  const placementPlan = basePlacementPlan.length
    ? basePlacementPlan
    : (resumeDerivedPlan.length ? resumeDerivedPlan : buildAtsFallbackPlacementPlanFromMetrics(breakdown));
  const placementSource = basePlacementPlan.length
    ? "ats"
    : (resumeDerivedPlan.length ? "resume-jd" : "metrics");
  const placementHints = placementPlan
    .filter((item) => item.type === "keyword")
    .map((item) => ({
      title: `Keyword: ${item.label}`,
      location: `${item.section} (${item.where})`,
      action: item.template,
    }));

  const weakReasons = Object.entries(breakdown)
    .filter(([metric, value]) => {
      const max = metricMax[metric] || 10;
      return (Number(value) || 0) / max < 0.55;
    })
    .map(([metric, value]) => {
      const max = metricMax[metric] || 10;
      const detail = metricDetails[metric];
      if (!detail) return "";
      return {
        title: metric.toUpperCase(),
        scoreText: `${Number(value) || 0}/${max}`,
        location: detail.location,
        action: detail.fix,
      };
    })
    .filter(Boolean);

  const missedItems = [
    ...missingSections,
    ...missingKeywords.map((keyword) => `Missing keyword: ${keyword}`),
  ];

  const addItems = [
    ...recommendations,
    ...missingSections.map((section) => `Add or strengthen section: ${section}`),
    ...missingKeywords.slice(0, 10).map((keyword) => `Add keyword naturally in relevant bullet: ${keyword}`),
  ];

  const uniqueMissedItems = [...new Set(missedItems)].slice(0, 12);
  const uniqueAddItems = [...new Set(addItems)].slice(0, 12);
  const uniqueReasons = [...weakReasons, ...placementHints].slice(0, 12);
  const renderedReasons = isFocusView ? uniqueReasons.slice(0, 4) : uniqueReasons;

  const metricEvidenceMap = {
    contact: evidence.contact || [],
    sections: evidence.sections || [],
    skills: evidence.skills || [],
    formatting: evidence.formatting || [],
    impact: evidence.impact || [],
    keywords: evidence.keywords || [],
  };

  const inlineSuggestions = buildInlineSuggestions({
    aiRewrite,
    aiInsights,
    missingKeywords,
    breakdown,
    detectedSections,
  });

  if (isJobMatched) {
    const keywordPlacementItems = placementPlan.filter((item) => item.type === "keyword");
    const nonKeywordPlacementItems = placementPlan.filter((item) => item.type !== "keyword");
    const requiredSkills = uniqueNormalizedLines(keywordPlacementItems.map((item) => item.label));
    const requiredSkillsSection = keywordPlacementItems[0]?.section || "Skills";
    const requiredSkillsWhere = keywordPlacementItems[0]?.where || "Create Resume > Skills";
    const encodedSkills = encodeURIComponent(JSON.stringify(requiredSkills));
    const encodedSkillsSection = encodeURIComponent(String(requiredSkillsSection || "Skills"));

    emptyState.style.display = "none";
    result.style.display = "block";
    result.innerHTML = `
      <div class="ats-shell">
        <section class="ats-panel" style="margin-top:0;">
          <div class="ats-panel-title">Data To Change To Increase Score</div>
          <div class="ats-note ats-note-info" style="margin-bottom:10px;">Current ATS Score: <strong style="color:var(--text1);">${score}%</strong></div>
          <div class="ats-note ats-note-info" style="margin-bottom:10px;">${placementSource === "resume-jd" ? "Based on uploaded resume + JD comparison." : placementSource === "ats" ? "Based on ATS missing sections/keywords." : "Based on weakest ATS scoring areas."}</div>
          <div class="ats-note" style="margin-bottom:10px;">
            <strong style="color:var(--text1);">Missing data and exact section to add:</strong>
            ${requiredSkills.length ? `
              <div style="margin-top:8px;">
                <div style="font-size:12px;color:var(--text2);margin-bottom:6px;">Required skills (one section):</div>
                <div class="ats-missing-plan-row">
                  <span class="ats-missing-section-badge">Add in: ${escapeHtml(requiredSkillsSection)}</span>
                  <span class="ats-missing-where">${escapeHtml(requiredSkillsWhere)}</span>
                  <button type="button" class="ats-keyword-add-btn" onclick="addDefaultKeywordsBatch(decodeURIComponent('${encodedSkills}'), decodeURIComponent('${encodedSkillsSection}'))">Add All</button>
                </div>
                <div class="ats-add-keyword-wrap" style="margin-top:8px;">
                  ${requiredSkills.map((skill) => `<span class="chip" style="border-color:rgba(255,93,130,0.45);color:#ff9db5;">${escapeHtml(skill)}</span>`).join("")}
                </div>
              </div>
            ` : ""}
            <div class="ats-missing-plan-wrap">
              ${(nonKeywordPlacementItems.length ? nonKeywordPlacementItems : (requiredSkills.length ? [{ label: "Required skills from JD", section: requiredSkillsSection, where: requiredSkillsWhere, type: "group" }] : [])).map((item) => {
                const safeLabel = encodeURIComponent(String(item.label || ""));
                const safeSection = encodeURIComponent(String(item.section || ""));
                return `<div class="ats-missing-plan-row"><span class="chip" style="border-color:rgba(255,93,130,0.45);color:#ff9db5;">${escapeHtml(item.label)}</span><span class="ats-missing-section-badge">Add in: ${escapeHtml(item.section)}</span><span class="ats-missing-where">${escapeHtml(item.where)}</span>${item.type === "keyword" ? `<button type="button" class="ats-keyword-add-btn" onclick="addDefaultKeyword(decodeURIComponent('${safeLabel}'), decodeURIComponent('${safeSection}'))">Add</button>` : ""}</div>`;
              }).join("")}
            </div>
          </div>
        </section>
      </div>
    `;
    return;
  }

  const rankedMetrics = Object.entries(breakdown)
    .map(([metric, value]) => {
      const max = metricMax[metric] || 10;
      const raw = Number(value) || 0;
      const ratio = max ? raw / max : 0;
      return { metric, raw, max, ratio };
    })
    .sort((a, b) => a.ratio - b.ratio);

  const topWeakMetrics = rankedMetrics.slice(0, 3);
  const primaryWeakMetric = topWeakMetrics[0]?.metric || "keywords";
  const evidenceLineCount = Object.values(metricEvidenceMap).reduce((acc, lines) => acc + (Array.isArray(lines) ? lines.length : 0), 0);
  const aiConfidence = Math.max(45, Math.min(97, 58 + matchedKeywords.length * 2 + evidenceLineCount));
  const atsTier = score >= 85 ? "High Match" : score >= 70 ? "Competitive" : score >= 55 ? "Needs Strengthening" : "High Risk";

  const shortlistPlan = [];
  if (missingKeywords.length) {
    shortlistPlan.push(`Add and demonstrate at least ${Math.min(8, missingKeywords.length)} missing JD keywords in resume bullets.`);
  }
  if (missingSections.length) {
    shortlistPlan.push(`Complete missing sections first: ${missingSections.join(", ")}.`);
  }
  if ((Number(breakdown.impact) || 0) < 6) {
    shortlistPlan.push("Rewrite top 5 bullets with measurable outcomes (%, time saved, revenue, users, scale).",);
  }
  if ((Number(breakdown.formatting) || 0) < 6) {
    shortlistPlan.push("Use ATS-friendly layout: clear headings, concise bullets, no dense paragraphs.");
  }
  const uniqueShortlistPlan = [...new Set(shortlistPlan)].slice(0, 5);
  const renderedShortlistPlan = isFocusView ? uniqueShortlistPlan.slice(0, 3) : uniqueShortlistPlan;

  const rewriteCards = aiRewrite?.prioritized_actions?.length
    ? aiRewrite.prioritized_actions.map((item) => `
      <div class="ats-ai-card">
        <div class="ats-ai-card-title">${escapeHtml(item.title || "Rewrite suggestion")}</div>
        <div><strong style="color:var(--text1);">Where to change:</strong> ${escapeHtml(item.location || "Resume sections")}</div>
        <div><strong style="color:var(--text1);">What to add:</strong> ${escapeHtml(item.action || "Add stronger, role-specific proof.")}</div>
      </div>
    `).join("")
    : "";

  const rewrittenSummary = aiRewrite?.rewritten_summary
    ? `<div class="ats-ai-card"><div class="ats-ai-card-title">Summary rewrite</div><div>${escapeHtml(aiRewrite.rewritten_summary)}</div></div>`
    : "";

  const rewrittenBullets = Array.isArray(aiRewrite?.rewritten_bullets) && aiRewrite.rewritten_bullets.length
    ? aiRewrite.rewritten_bullets.map((bullet, index) => `<div class="ats-ai-card"><div class="ats-ai-card-title">Bullet rewrite ${index + 1}</div>${escapeHtml(bullet)}</div>`).join("")
    : "";

  const aiBoostCards = aiInsights.length
    ? aiInsights.map((item) => `
      <div class="ats-ai-card ats-ai-card-alt">
        <div class="ats-ai-card-title">${escapeHtml(item.title || "AI Boost")}</div>
        <div><strong style="color:var(--text1);">Where to change:</strong> ${escapeHtml(item.location || "Resume sections")}</div>
        <div><strong style="color:var(--text1);">What to add:</strong> ${escapeHtml(item.action || "Add role-specific proof and metrics.")}</div>
      </div>
    `).join("")
    : `<div class="ats-ai-card">No AI boost suggestions available.</div>`;

  emptyState.style.display = "none";
  result.style.display = "block";
  result.innerHTML = `
    <div class="ats-shell">
      <div class="ats-hero">
        <div class="score-ring" style="width:96px;height:96px;">
          <svg width="96" height="96" viewBox="0 0 90 90">
            <circle cx="45" cy="45" r="38" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="8"/>
            <circle cx="45" cy="45" r="38" fill="none" stroke="#6c63ff" stroke-width="8" stroke-dasharray="239" stroke-dashoffset="${offset}" stroke-linecap="round"/>
          </svg>
          <div class="score-text">
            <div class="score-num" style="font-size:20px;">${score}</div>
            <div class="score-lbl">ATS</div>
          </div>
        </div>
        <div class="ats-hero-meta">
          <h3 class="ats-hero-title">ATS Readiness Report</h3>
          <div class="ats-hero-row">Mode: <strong>${escapeHtml(mode)}</strong></div>
          <div class="ats-hero-row">Label: <strong>${escapeHtml(label || "General")}</strong></div>
          <div class="ats-tag-row">
            <span class="tag ${score >= 85 ? "tag-green" : score >= 70 ? "tag-orange" : "tag-red"}">${matchedKeywords.length} matched keywords</span>
            <span class="tag ${scoreGap > 0 ? "tag-orange" : "tag-green"}">+${scoreGap}% potential</span>
          </div>
        </div>
      </div>

      <div class="ats-callout ${score >= 80 ? "ats-callout-good" : score >= 65 ? "ats-callout-mid" : "ats-callout-low"}">
        <strong>Quick verdict:</strong> ${score >= 80 ? "Strong profile. Focus on precision and keyword lift for top-match roles." : score >= 65 ? "Decent base. Strengthen weak sections and add JD-specific evidence." : "Needs revision. Prioritize missing sections, keywords, and impact bullets first."}
      </div>

      ${isJobMatched ? `
      <section class="ats-panel" style="margin-top:0;">
        <div class="ats-panel-title">Editable Full Resume (Words To Edit In Red)</div>
        <div class="ats-editor-hint">This appears after JD scoring. Edit the highlighted words, then click re-analyze.</div>
        <div id="ats-resume-editor" class="ats-resume-editor">${renderEditableResumeWithHighlights(state.raw_text || "", metricEvidenceMap, missingKeywords, inlineSuggestions)}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">
          <button class="btn btn-primary" type="button" onclick="applyEditedResumeAndRescore()">Re-analyze Edited Resume</button>
        </div>
      </section>
      ` : `<section class="ats-panel" style="margin-top:0;"><div class="ats-panel-title">Editable Full Resume</div><div class="ats-note ats-note-info">Paste a JD and click Check ATS Score to open editable full resume with red word highlights.</div></section>`}

    </div>
  `;
}

function setAtsView(view) {
  const nextView = view === "focus" ? "focus" : "detailed";
  if (appState.ats_view === nextView) return;
  appState.ats_view = nextView;
  savePersistentAppState();
  renderAtsChecker(appState);
}

function buildInlineSuggestions({ aiRewrite = null, aiInsights = [], missingKeywords = [], breakdown = {}, detectedSections = {} }) {
  const suggestions = [];
  const pushSuggestion = (item, type) => {
    if (!item) return;
    const title = String(item.title || item.location || "AI suggestion").trim();
    const location = String(item.location || "Relevant resume section").trim();
    const action = String(item.action || item.what_to_add || item.rewrite || "Strengthen this line with a clearer, role-aligned version.").trim();
    const why = String(item.why || item.reason || item.rationale || item.explanation || "").trim();
    const betterText = String(item.better_text || item.betterText || item.rewrite_text || item.rewrite || action).trim();
    const goodPoints = normalizeList(item.good_points || item.points || item.bullets || item.highlights || []).slice(0, 5);
    const impact = String(item.impact || item.expected_impact || "").trim();
    const priority = String(item.priority || (type === "rewrite" ? "high" : type === "metric" ? "medium" : "medium")).trim();
    const tokens = [title, location, action]
      .join(" ")
      .split(/[\s,;:()\/|]+/)
      .map((part) => normalizeWordToken(part))
      .filter(Boolean);
    suggestions.push({
      title,
      location,
      action,
      why,
      betterText,
      goodPoints,
      impact,
      priority,
      analysis: why || impact || action,
      tokens: [...new Set(tokens)],
      type,
    });
  };

  (aiRewrite?.prioritized_actions || []).forEach((item) => pushSuggestion(item, "rewrite"));
  (aiInsights || []).forEach((item) => pushSuggestion(item, "insight"));

  (missingKeywords || []).slice(0, 12).forEach((keyword) => {
    pushSuggestion({
      title: `Add ${keyword}`,
      location: "Summary, Skills, Experience, or Projects",
      action: `Add ${keyword} naturally in the closest matching bullet or section, then show proof with a result or tool used.`,
    }, "keyword");
  });

  if (!detectedSections.summary) {
    pushSuggestion({
      title: "Add summary",
      location: "Top of resume",
      action: "Write a short role-focused summary with your target title, strongest tools, and one measurable win.",
      why: "A strong summary helps recruiters understand your role fit in the first few seconds and improves ATS keyword alignment.",
      good_points: ["target role", "top tools", "one measurable result", "clear value proposition"],
      better_text: "Results-driven [role] with experience in [tools/skills], delivered [result], and focused on building reliable, high-quality solutions.",
    }, "section");
  }

  if (!detectedSections.experience) {
    pushSuggestion({
      title: "Strengthen experience",
      location: "Experience section",
      action: "Add 3 to 5 bullets that show action, scope, and measurable impact.",
      why: "Experience bullets carry the strongest evidence for hiring managers and give ATS more role-specific context.",
      good_points: ["action verb", "scope", "tools used", "metric or outcome"],
      better_text: "Built and maintained [feature/system] using [tool], improved [metric], and collaborated with [team] to deliver [outcome].",
    }, "section");
  }

  if ((Number(breakdown.impact) || 0) < 5) {
    pushSuggestion({
      title: "Quantify impact",
      location: "Experience and Projects bullets",
      action: "Use numbers such as %, time saved, revenue, users, scale, or accuracy to make the result concrete.",
      why: "Metrics make your achievements believable and easier to compare against other candidates.",
      good_points: ["percentage", "time saved", "revenue", "users", "accuracy", "scale"],
      better_text: "Improved [process/feature] by [metric], saving [time] and increasing [quality/performance/result].",
    }, "metric");
  }

  if (!detectedSections.projects) {
    pushSuggestion({
      title: "Add projects",
      location: "Projects section",
      action: "Include 2 to 3 projects with your role, tools, and the outcome you delivered.",
      why: "Projects show practical application of your skills and help prove hands-on ability when experience is limited.",
      good_points: ["project name", "tools used", "your role", "result delivered"],
      better_text: "Built [project name] using [tools], owned [your role], and delivered [measurable outcome] for [user/problem].",
    }, "section");
  }

  return suggestions;
}

function buildBuilderAiSuggestions(state) {
  const ats = state?.ats_data || {};
  const optimizerSuggestions = Array.isArray(state?.opt_data?.suggestions)
    ? state.opt_data.suggestions.map((suggestion) => ({
      title: "Optimizer suggestion",
      location: "Resume builder",
      action: String(suggestion || "").trim(),
    }))
    : [];

  return buildInlineSuggestions({
    aiRewrite: state?.ai_rewrite || null,
    aiInsights: optimizerSuggestions,
    missingKeywords: ats.missing_keywords || [],
    breakdown: ats.breakdown || {},
    detectedSections: ats.detected_sections || {},
  });
}

function getInlineSuggestionsForLine(line, suggestions, fallbackIndex = 0) {
  if (!Array.isArray(suggestions) || !suggestions.length) return [];

  const normalizedLine = normalizeEvidenceLine(line);
  const lineTokens = new Set(
    String(line || "")
      .split(/[\s,;:()\/|]+/)
      .map((part) => normalizeWordToken(part))
      .filter(Boolean)
  );

  const matched = suggestions.filter((suggestion) => {
    const tokens = Array.isArray(suggestion.tokens) ? suggestion.tokens : [];
    return tokens.some((token) => normalizedLine.includes(token) || lineTokens.has(token));
  });

  if (matched.length) {
    return matched.slice(0, 2);
  }

  return [suggestions[fallbackIndex % suggestions.length]].filter(Boolean).slice(0, 1);
}

function renderInlineSuggestionItems(suggestions, lineIndex = -1) {
  if (!Array.isArray(suggestions) || !suggestions.length) return "";

  const normalized = suggestions
    .map((item) => ({
      title: String(item?.title || "AI suggestion").trim(),
      location: String(item?.location || "Resume builder").trim(),
      action: String(item?.action || item?.title || "").trim(),
    }))
    .filter((item) => item.action);

  if (!normalized.length) return "";

  const primary = normalized[0];
  const encodedPayload = encodeURIComponent(JSON.stringify(normalized));
  const moreCount = Math.max(0, normalized.length - 1);

  return `
    <div class="ats-editor-suggestion">
      <div class="ats-editor-suggestion-top">
        ${renderAiLogo()}
        <div class="ats-editor-suggestion-title">AI suggestion</div>
      </div>
      <div class="ats-editor-suggestion-location">${escapeHtml(primary.location || "Relevant resume section")}</div>
      <div class="ats-editor-suggestion-text">${escapeHtml(primary.action || "Strengthen this line with a clearer, role-aligned version.")}</div>
      ${moreCount ? `<div class="ats-editor-suggestion-meta">+${moreCount} more suggestions ready</div>` : ""}
      <button type="button" class="ats-suggestion-add-btn" onclick="applyAllAiSuggestionsToBuilder(decodeURIComponent('${encodedPayload}'))">Use in Builder</button>
    </div>
  `;
}

function renderAiLogo() {
  return `
    <span class="ats-ai-logo" aria-hidden="true">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M8 2.2l.9 2.9L11.8 6l-2.9.9L8 9.8l-.9-2.9L4.2 6l2.9-.9L8 2.2z"/>
      </svg>
    </span>
  `;
}

function getBuilderSuggestionTarget(title, location, action) {
  const blob = `${title || ""} ${location || ""} ${action || ""}`.toLowerCase();

  if (/(summary|profile|objective|about)/.test(blob)) {
    return { fieldId: "builder-summary", type: "textarea" };
  }

  if (/(skill|keyword|tech stack|tool|language)/.test(blob)) {
    return { fieldId: "new-skill", type: "skill" };
  }
  if (/(education|degree|college|university|school|course)/.test(blob)) {
    return { fieldId: "builder-education-input", type: "textarea" };
  }
  if (/(project|portfolio|case study|build)/.test(blob)) {
    return { fieldId: "builder-projects-input", type: "textarea" };
  }
  if (/(experience|bullet|impact|achievement|work|role|top of resume|header)/.test(blob)) {
    return { fieldId: "builder-experience-input", type: "textarea" };
  }
  return { fieldId: "builder-summary", type: "textarea" };
}

function syncBuilderAfterSuggestionApply(touchedFieldIds = []) {
  const touched = new Set((touchedFieldIds || []).filter(Boolean));

  if (touched.has("builder-projects-input") && getTextAreaLines("builder-projects-input").length) {
    addProject();
  }
  if (touched.has("builder-experience-input") && getTextAreaLines("builder-experience-input").length) {
    addExperience();
  }
  if (touched.has("builder-education-input") && getTextAreaLines("builder-education-input").length) {
    addEducation();
  }

  const draft = getStructuredResumeData({ withDefaults: false });
  appState.resume_data = {
    ...(appState.resume_data || {}),
    ...draft,
  };
  appState.generated_resume = {
    ...(appState.generated_resume || {}),
    ...draft,
  };
  appState.skills = draft.skills || appState.skills || [];
  savePersistentAppState();
  renderBuilder(appState);
}

function appendBuilderValue(field, value, mode = "textarea") {
  if (!field || !value) return;
  const cleanValue = String(value).replace(/\s+/g, " ").trim();
  if (!cleanValue) return;

  if (mode === "skill") {
    field.value = cleanValue;
    addSkill();
    return;
  }

  const existing = String(field.value || "").trim();
  if (!existing) {
    field.value = cleanValue;
    return;
  }

  const normalizedExisting = existing.replace(/[\s.]+$/, "");
  const normalizedValue = cleanValue.replace(/^[-•\s]+/, "");
  field.value = `${normalizedExisting}\n${normalizedValue}`;
}

function applyAiSuggestionToBuilder(title, location, action) {
  const suggestionTitle = String(title || "AI suggestion").trim();
  const suggestionLocation = String(location || "Resume builder").trim();
  const suggestionAction = String(action || suggestionTitle).trim();
  const target = getBuilderSuggestionTarget(suggestionTitle, suggestionLocation, suggestionAction);

  showPage("builder");
  switchTab("build");

  requestAnimationFrame(() => {
    const field = document.getElementById(target.fieldId);
    if (!field) return;

    appendBuilderValue(field, suggestionAction, target.type);
    syncBuilderAfterSuggestionApply([target.fieldId]);
    field.focus();
    if (typeof field.setSelectionRange === "function" && field.value) {
      const end = field.value.length;
      field.setSelectionRange(end, end);
    }
    showToast("AI suggestion applied.", "success");
  });
}

function applyAllAiSuggestionsToBuilder(serializedSuggestions = "") {
  let parsed = [];
  try {
    parsed = JSON.parse(String(serializedSuggestions || "[]"));
  } catch (error) {
    console.warn("Unable to parse suggestion payload:", error);
    parsed = [];
  }

  const suggestions = Array.isArray(parsed)
    ? parsed
      .map((item) => ({
        title: String(item?.title || "AI suggestion").trim(),
        location: String(item?.location || "Resume builder").trim(),
        action: String(item?.action || item?.title || "").trim(),
      }))
      .filter((item) => item.action)
    : [];

  if (!suggestions.length) return;

  showPage("builder");
  switchTab("build");

  requestAnimationFrame(() => {
    const grouped = {
      skill: [],
      textarea: {},
    };
    const touchedFieldIds = new Set();

    suggestions.forEach((item) => {
      const target = getBuilderSuggestionTarget(item.title, item.location, item.action);
      touchedFieldIds.add(target.fieldId);
      if (target.type === "skill") {
        grouped.skill.push(item.action);
        return;
      }
      if (!grouped.textarea[target.fieldId]) grouped.textarea[target.fieldId] = [];
      grouped.textarea[target.fieldId].push(item.action);
    });

    const uniqueSkills = [...new Set(grouped.skill.map((v) => String(v || "").trim()).filter(Boolean))];
    uniqueSkills.forEach((skillText) => {
      const skillInput = document.getElementById("new-skill");
      if (!skillInput) return;
      appendBuilderValue(skillInput, skillText, "skill");
    });

    const textareaTargets = Object.entries(grouped.textarea);
    textareaTargets.forEach(([fieldId, values]) => {
      const field = document.getElementById(fieldId);
      if (!field) return;
      const uniqueLines = [...new Set(values.map((v) => String(v || "").trim()).filter(Boolean))];
      uniqueLines.forEach((line) => appendBuilderValue(field, line, "textarea"));
    });

    const preferredFocusId = textareaTargets[0]?.[0] || (uniqueSkills.length ? "new-skill" : "builder-summary");
    const focusField = document.getElementById(preferredFocusId);
    syncBuilderAfterSuggestionApply([...touchedFieldIds]);
    if (focusField) {
      focusField.focus();
      if (typeof focusField.setSelectionRange === "function" && focusField.value) {
        const end = focusField.value.length;
        focusField.setSelectionRange(end, end);
      }
    }
    showToast("AI suggestions applied to builder.", "success");
  });
}

function normalizeEvidenceLine(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9@#%+./:\- ]/g, "")
    .trim();
}

function normalizeWordToken(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9+#.%/\-]/g, "")
    .trim();
}

function highlightIssueWords(line, issueWordSet) {
  const parts = [];
  const regex = /\b[\w+#.%/\-]+\b/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(line)) !== null) {
    const word = match[0];
    const start = match.index;
    const end = start + word.length;
    parts.push(escapeHtml(line.slice(lastIndex, start)));
    const normalizedWord = normalizeWordToken(word);
    if (normalizedWord && issueWordSet.has(normalizedWord)) {
      parts.push(`<span class="ats-editor-word-issue">${escapeHtml(word)}</span>`);
    } else {
      parts.push(escapeHtml(word));
    }
    lastIndex = end;
  }

  parts.push(escapeHtml(line.slice(lastIndex)));
  return parts.join("");
}

function buildIssueWordSet(lines, missingKeywords = []) {
  const missingKeywordTokens = (missingKeywords || [])
    .flatMap((keyword) => String(keyword)
      .split(/[\s,/()]+/)
      .map((part) => normalizeWordToken(part))
      .filter((part) => part.length >= 2));

  const evidenceTokens = (lines || [])
    .flatMap((line) => String(line)
      .split(/[\s,/()]+/)
      .map((word) => normalizeWordToken(word))
      .filter((word) => word.length >= 3));

  return new Set([...evidenceTokens, ...missingKeywordTokens]);
}

function renderChangeOnlyEditor(changeLines = [], missingKeywords = [], inlineSuggestions = []) {
  if (!changeLines.length) {
    return `<div class="ats-editor-empty">No specific lines detected yet. Add JD details and re-run ATS.</div>`;
  }

  const issueWordSet = buildIssueWordSet(changeLines, missingKeywords);
  return changeLines.map((line, index) => {
    const encodedOriginal = encodeURIComponent(line);
    const suggestions = getInlineSuggestionsForLine(line, inlineSuggestions, index);
    const suggestionMarkup = index === 0 ? renderInlineSuggestionItems(suggestions, index) : "";
    return `<div class="ats-editor-line is-issue"><span class="ats-editor-line-no">${index + 1}</span><div class="ats-editor-line-body"><span class="ats-editor-line-text" contenteditable="true" spellcheck="false" data-original="${encodedOriginal}">${highlightIssueWords(line, issueWordSet)}</span>${suggestionMarkup}</div></div>`;
  }).join("");
}

function addDefaultKeyword(keyword, sectionHint = "") {
  const editor = document.getElementById("ats-resume-editor");
  if (!editor) return;

  const safeKeyword = String(keyword || "").replace(/\s+/g, " ").trim();
  const safeSection = String(sectionHint || "").replace(/\s+/g, " ").trim();
  if (!safeKeyword) return;

  const line = document.createElement("div");
  line.className = "ats-editor-line is-issue";

  const lineNo = editor.querySelectorAll(".ats-editor-line").length + 1;
  let defaultText = `Implemented ${safeKeyword} in project delivery to improve performance and measurable outcomes.`;
  if (/summary/i.test(safeSection)) {
    defaultText = `Summary: Hands-on with ${safeKeyword} and applied it to deliver role-aligned outcomes.`;
  } else if (/skills/i.test(safeSection)) {
    defaultText = `Skills: ${safeKeyword} (validated with project/experience impact).`;
  } else if (/experience/i.test(safeSection)) {
    defaultText = `Experience: Applied ${safeKeyword} to improve quality, delivery speed, or business impact.`;
  } else if (/project/i.test(safeSection)) {
    defaultText = `Project: Built solution using ${safeKeyword} and achieved measurable results.`;
  } else if (/certification/i.test(safeSection)) {
    defaultText = `Certification: Added ${safeKeyword} credential relevant to the JD.`;
  }

  line.innerHTML = `<span class="ats-editor-line-no">${lineNo}</span><div class="ats-editor-line-body"><span class="ats-editor-line-text" contenteditable="true" spellcheck="false" data-added="true">${highlightIssueWords(defaultText, buildIssueWordSet([defaultText], [safeKeyword]))}</span></div>`;
  editor.appendChild(line);
}

function addDefaultKeywordsBatch(encodedKeywordsJson, sectionHint = "") {
  let keywords = [];
  try {
    keywords = JSON.parse(String(encodedKeywordsJson || "[]"));
  } catch (_) {
    keywords = [];
  }
  normalizeList(keywords).slice(0, 20).forEach((keyword) => addDefaultKeyword(keyword, sectionHint));
}

function addSuggestionLine(suggestionText, suggestionIndex = 0) {
  const editor = document.getElementById("ats-resume-editor");
  if (!editor) return;

  const safeText = String(suggestionText || "").replace(/\s+/g, " ").trim();
  if (!safeText) return;

  const line = document.createElement("div");
  line.className = "ats-editor-line is-issue";

  const editorLines = Array.from(editor.querySelectorAll(".ats-editor-line"));
  const lineNo = editorLines.length + 1;
  const targetLine = editorLines[Math.min(Math.max(0, suggestionIndex), Math.max(0, editorLines.length - 1))];

  line.innerHTML = `<span class="ats-editor-line-no">${lineNo}</span><div class="ats-editor-line-body"><span class="ats-editor-line-text" contenteditable="true" spellcheck="false" data-added="true">${escapeHtml(safeText)}</span></div>`;

  if (targetLine && targetLine.parentNode === editor) {
    targetLine.insertAdjacentElement("afterend", line);
  } else {
    editor.appendChild(line);
  }
}

function renderEditableResumeWithHighlights(rawText, evidenceMap, missingKeywords = [], inlineSuggestions = []) {
  const lines = String(rawText || "").split(/\r?\n/);
  const evidenceLines = Object.values(evidenceMap || {})
    .flatMap((items) => Array.isArray(items) ? items : [])
    .map((line) => String(line || ""))
    .filter(Boolean);

  const issueWordSet = buildIssueWordSet(evidenceLines, missingKeywords);

  const normalizedEvidenceLines = evidenceLines
    .map((line) => normalizeEvidenceLine(line))
    .filter(Boolean);

  if (!lines.length || (lines.length === 1 && !lines[0].trim())) {
    return `<div class="ats-editor-empty">Upload a resume first to see editable highlighted content.</div>`;
  }

  let suggestionShown = false;

  return lines.map((line, index) => {
    const normalizedLine = normalizeEvidenceLine(line);
    const shouldHighlight = normalizedLine && normalizedEvidenceLines.some((e) => normalizedLine.includes(e) || e.includes(normalizedLine));
    const suggestions = shouldHighlight ? getInlineSuggestionsForLine(line, inlineSuggestions, index) : [];
    const suggestionMarkup = shouldHighlight && !suggestionShown ? renderInlineSuggestionItems(suggestions, index) : "";
    if (suggestionMarkup) suggestionShown = true;
    return `<div class="ats-editor-line ${shouldHighlight ? "is-issue" : ""}"><span class="ats-editor-line-no">${index + 1}</span><div class="ats-editor-line-body"><span class="ats-editor-line-text" contenteditable="true" spellcheck="false">${highlightIssueWords(line, issueWordSet) || " "}</span>${suggestionMarkup}</div></div>`;
  }).join("");
}

async function applyEditedResumeAndRescore() {
  if (blockGuestWriteAccess("ATS editing")) return;
  const editor = document.getElementById("ats-resume-editor");
  if (!editor) return;
  const reanalyzeBtn = document.getElementById("ats-reanalyze-btn");
  const reanalyzeStatus = document.getElementById("ats-reanalyze-status");

  const editableLines = Array.from(editor.querySelectorAll(".ats-editor-line-text"));
  let updatedText = "";

  if (editableLines.length && editableLines.some((line) => typeof line.dataset.original === "string")) {
    let mergedText = String(appState.raw_text || "");
    const addedLines = [];
    editableLines.forEach((lineEl) => {
      const original = decodeURIComponent(lineEl.dataset.original || "").replace(/\u00a0/g, " ").trim();
      const edited = String(lineEl.textContent || "").replace(/\u00a0/g, " ").trim();
      if (!edited) return;
      if (!original) {
        if (lineEl.dataset.added === "true") {
          addedLines.push(edited);
        }
        return;
      }
      if (original !== edited) {
        mergedText = mergedText.replace(original, edited);
      }
    });
    if (addedLines.length) {
      mergedText = `${mergedText}\n${addedLines.join("\n")}`.trim();
    }
    updatedText = mergedText.trim();
  } else {
    updatedText = String(editableLines.length
      ? editableLines.map((line) => line.textContent || "").join("\n")
      : editor.innerText || "")
      .replace(/\u00a0/g, " ")
      .trim();
  }

  if (!updatedText) {
    alert("Resume text is empty. Add content before re-analyzing.");
    return;
  }

  appState.raw_text = updatedText;
  appState.resume_data = {};
  savePersistentAppState();

  const jdInput = document.getElementById("ats-jd");
  const jdText = jdInput ? jdInput.value.trim() : "";

  if (reanalyzeBtn) {
    reanalyzeBtn.disabled = true;
    reanalyzeBtn.textContent = "Re-analyzing...";
  }
  if (reanalyzeStatus) {
    reanalyzeStatus.textContent = "Re-analyzing edited resume...";
  }

  const atsData = await runAtsScore(jdText, { silent: false });

  if (reanalyzeBtn) {
    reanalyzeBtn.disabled = false;
    reanalyzeBtn.textContent = "Re-analyze Edited Resume";
  }
  if (reanalyzeStatus) {
    const score = Number(atsData?.score ?? appState.ats_data?.score ?? 0);
    reanalyzeStatus.textContent = `Updated ATS Score: ${Number.isFinite(score) ? score : 0}%`;
  }
}

async function runAtsScore(jobDescription = "", options = {}) {
  const { silent = false, useResumeData = false } = options;
  if (!appState.raw_text) {
    if (!silent) {
      alert("Upload a resume first.");
    }
    return null;
  }

  try {
    const atsResp = await postJson(`${BACKEND_BASE_URL}/resume/ats-score`, {
      resume_text: appState.raw_text,
      resume_data: useResumeData ? appState.resume_data : {},
      job_description: jobDescription,
    });

    const atsData = atsResp.ats_data || null;
    appState.ats_data = atsData;
    renderAtsChecker(appState);
    renderAllPages(appState);
    savePersistentAppState();

    return atsData;
  } catch (error) {
    console.error("ATS score error:", error);
    if (!silent) {
      alert("Unable to calculate ATS score right now.");
    }
    return null;
  }
}

async function runRewriteSuggestions(jobDescription = "", options = {}) {
  const { silent = false } = options;
  if (!appState.raw_text) {
    if (!silent) alert("Upload a resume first.");
    return null;
  }

  try {
    const response = await postJson(`${BACKEND_BASE_URL}/ai/rewrite-suggestions`, {
      resume_text: appState.raw_text,
      resume_data: appState.resume_data,
      job_description: jobDescription,
      ats_data: appState.ats_data,
    });

    appState.ai_rewrite = response.rewrite || null;
    renderAtsChecker(appState);
    savePersistentAppState();
    return appState.ai_rewrite;
  } catch (error) {
    console.warn("AI rewrite suggestions unavailable:", error);
    if (!silent) {
      alert("Could not generate AI rewrite suggestions right now.");
    }
    return null;
  }
}

async function checkAtsScore() {
  if (blockGuestWriteAccess("ATS score check")) return;
  const jdInput = document.getElementById("ats-jd");
  const jobDescription = jdInput ? jdInput.value.trim() : "";
  await runAtsScore(jobDescription, { silent: false });
}

function resetAtsScore() {
  const jdInput = document.getElementById("ats-jd");
  if (jdInput) jdInput.value = "";
  appState.ats_data = appState.base_ats_data || null;
  renderAtsChecker(appState);
  renderAllPages(appState);
  savePersistentAppState();
}

/* ══════════════════════════════════════════
   PAGE NAVIGATION
══════════════════════════════════════════ */
function toggleSidebarMenu() {
  const app = document.querySelector('.app');
  if (!app) return;

  if (window.matchMedia('(max-width: 900px)').matches) {
    app.classList.toggle('menu-open');
    return;
  }

  app.classList.toggle('menu-collapsed');
}

function closeSidebarMenu() {
  const app = document.querySelector('.app');
  if (!app) return;
  app.classList.remove('menu-open');
}

function getStandalonePageFile(pageId) {
  const standalonePageMap = {
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
  return standalonePageMap[String(pageId || '').toLowerCase()] || '';
}

function getPageIdFromCurrentFile() {
  const fileToPageMap = {
    'dashboard.html': 'dashboard',
    'resume analyzer.html': 'analyzer',
    'career explorer.html': 'explorer',
    'market trends.html': 'market',
    'create resume.html': 'create',
    'jd optimize.html': 'builder',
    'jobs for you.html': 'learning',
    'setting.html': 'settings',
    'profile.html': 'profile',
    'index.html': '',
    '': '',
  };
  const currentFile = decodeURIComponent((window.location.pathname || '').split('/').pop() || '').toLowerCase();
  return fileToPageMap[currentFile] || '';
}

function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  closeSidebarSettingsMenu();
  appState.current_page = id || "dashboard";
  if (!appState.ai_context || appState.ai_context.page !== appState.current_page) {
    appState.ai_context = { page: appState.current_page, fieldId: "", updatedAt: Date.now() };
  }

  const page = document.getElementById('page-' + id);
  if (page) {
    page.classList.add('active');
    page.classList.remove('fade-in');
    void page.offsetWidth;
    page.classList.add('fade-in');
  } else {
    const targetFile = getStandalonePageFile(id);
    if (targetFile) {
      const currentFile = decodeURIComponent((window.location.pathname || '').split('/').pop() || '').toLowerCase();
      if (currentFile !== targetFile.toLowerCase()) {
        appState.current_page = id || 'dashboard';
        savePersistentAppState();
        window.location.href = targetFile;
        return;
      }
    }
  }

  const activeNav = document.querySelector(`.nav-item[data-page="${id}"]`);
  if (activeNav) activeNav.classList.add('active');

  if (id === "analyzer") {
    ensureUploadZoneContent();
  }

  if (id === "settings") {
    loadSettingsSearchHistory();
  }

  if (window.matchMedia('(max-width: 900px)').matches) {
    closeSidebarMenu();
  }

  renderGlobalAiAssistant(appState);
  savePersistentAppState();
}

function showPageWithTab(pageId, tabId) {
  try {
    sessionStorage.setItem('resumepro_pending_tab', JSON.stringify({ pageId, tabId }));
  } catch (_) {
    // Ignore storage errors and continue.
  }
  showPage(pageId);
  setTimeout(() => switchTab(tabId), 100);
}

/* ══════════════════════════════════════════
   TAB SWITCHING
══════════════════════════════════════════ */
function switchTab(tab) {
  const currentPage = appState.current_page || 'builder';
  const page = document.getElementById(`page-${currentPage}`);

  const pageTabOrder = {
    builder: ['optimize', 'preview'],
    create: ['build', 'preview'],
  };
  const pageTabTargets = {
    builder: { build: 'tab-build', optimize: 'tab-optimize', preview: 'tab-preview' },
    create: { build: 'tab-build-shared', preview: 'tab-preview-shared' },
  };

  const tabOrder = pageTabOrder[currentPage] || pageTabOrder.builder;
  const tabButtons = page ? Array.from(page.querySelectorAll('.tab-bar .tab')) : [];
  tabButtons.forEach((button, idx) => {
    button.classList.toggle('active', tabOrder[idx] === tab);
  });

  Object.values(pageTabTargets[currentPage] || {}).forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });

  if (tab === "preview") {
    const mergedResume = getStructuredResumeData({ withDefaults: true });
    appState.generated_resume = mergedResume;
    appState.skills = mergedResume.skills || appState.skills || [];
    savePersistentAppState();
    renderBuilder(appState);
  }

  const targetId = (pageTabTargets[currentPage] || {})[tab] || ('tab-' + tab);
  const target = document.getElementById(targetId);
  if (target) target.style.display = '';
}

/* ══════════════════════════════════════════
   SKILLS
══════════════════════════════════════════ */
function addSkill() {
  if (blockGuestWriteAccess("adding skills")) return;
  const input = document.getElementById('new-skill');
  const val = input.value.trim();
  if (!val) return;

  const list = document.getElementById('skills-list');
  const chip = document.createElement('span');
  chip.className = 'chip';
  chip.innerHTML = `${val} <span class="chip-remove" onclick="removeChip(this)">×</span>`;
  list.appendChild(chip);

  input.value = '';
}

function removeChip(el) {
  if (blockGuestWriteAccess("removing skills")) return;
  el.closest('.chip').remove();
}

function getBuilderSkills() {
  const skillsList = document.getElementById("skills-list");
  if (!skillsList) return [];
  return Array.from(skillsList.querySelectorAll(".chip"))
    .map((chip) => chip.childNodes[0]?.textContent?.trim() || chip.textContent.trim().replace("x", "").replace("×", "").trim())
    .filter(Boolean);
}

function getBuilderSectionItems(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return [];

  const raw = Array.from(container.querySelectorAll("[data-project-header='true'], div[style*='font-size:13px;font-weight:500']"))
    .map((el) => (el.textContent || "").trim())
    .filter(Boolean);

  return raw.filter((item) => !/upload a resume to extract/i.test(item));
}

function normalizeEducationInputLines(lines) {
  const baseItems = normalizeList(lines || []);
  if (!baseItems.length) return [];

  const degreeRegex = /(B\.?\s?Tech|M\.?\s?Tech|B\.?\s?E\.?|M\.?\s?E\.?|Bachelor(?:\s+of\s+[A-Za-z\s]+)?|Master(?:\s+of\s+[A-Za-z\s]+)?|Intermediate|Inter\b|SSC\b|HSC\b|10th|12th|Diploma)/i;
  const monthYearRegex = /(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}|(?:19|20)\d{2}(?:\s*[-/]\s*(?:19|20)\d{2})?/gi;

  const candidateLines = [];

  baseItems.forEach((item) => {
    String(item || "")
      .split(/\r?\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((line) => {
        const compact = line.replace(/\s+/g, " ").trim();
        if (!compact) return;

        if (compact.includes("|")) {
          candidateLines.push(compact);
          return;
        }

        const fallbackParts = compact
          .split(/[;]+/)
          .map((part) => part.trim())
          .filter(Boolean);

        const sourceParts = fallbackParts.length > 1 ? fallbackParts : [compact];
        sourceParts.forEach((part) => {
          const cleanPart = String(part || "").replace(/\s+/g, " ").trim();
          if (!cleanPart) return;

          if (cleanPart.length < 4 && !/^(SSC|HSC|10th|12th|Inter|Intermediate)$/i.test(cleanPart)) {
            return;
          }

          const yearMatches = cleanPart.match(monthYearRegex) || [];
          const year = yearMatches.join(" - ").trim();

          const numberMatches = cleanPart.match(/\b\d{1,2}(?:\.\d+)?%?\b/g) || [];
          const score = numberMatches.find((num) => {
            const value = Number(String(num).replace("%", ""));
            return Number.isFinite(value) && value <= 100;
          }) || "";

          const degreeMatch = cleanPart.match(degreeRegex);
          const institutionLike = /(college|university|institute|school)\b/i.test(cleanPart);
          const degree = degreeMatch
            ? degreeMatch[0].replace(/\s+/g, " ").trim()
            : "Education";

          let institution = cleanPart;
          if (year) institution = institution.replace(new RegExp(yearMatches.join("|"), "gi"), " ");
          if (score) institution = institution.replace(new RegExp(`\\b${String(score).replace("%", "\\%") }\\b`, "gi"), " ");
          if (degreeMatch) institution = institution.replace(degreeMatch[0], " ");
          if (institutionLike && !degreeMatch) {
            institution = cleanPart;
          }
          institution = institution.replace(/[|,]+\s*$/g, "").replace(/\s+/g, " ").trim();

          if (!degreeMatch && !institutionLike && institution.length < 3 && !year && !score) {
            return;
          }

          candidateLines.push([degree, institution, year, score].filter(Boolean).join(" | ").trim());
        });
      });
  });

  return uniqueNormalizedLines(candidateLines.map((line) => {
    const raw = String(line || "").replace(/\s+/g, " ").trim();
    if (!raw) return "";

    const structured = parseStructuredLine(raw, ["degree", "institution", "year", "score"]);
    return [structured.degree, structured.institution, structured.year, structured.score]
      .filter(Boolean)
      .join(" | ")
      .trim();
  }));
}

function normalizeExperienceInputLines(lines) {
  const baseLines = uniqueNormalizedLines(lines || []);
  if (!baseLines.length) return [];

  return uniqueNormalizedLines(baseLines.map((line) => {
    const raw = String(line || "").replace(/\s+/g, " ").trim();
    if (!raw) return "";

    if (raw.includes("|")) {
      const structured = parseStructuredLine(raw, ["title", "company", "duration", "impact"]);
      return [structured.title, structured.company, structured.duration, structured.impact]
        .filter(Boolean)
        .join(" | ")
        .trim();
    }

    const dashParts = raw.split(/\s*[-–]\s*/).map((part) => part.trim()).filter(Boolean);
    if (dashParts.length >= 2) {
      const title = dashParts[0] || "";
      const company = dashParts[1] || "";
      const duration = dashParts[2] || "";
      const impact = dashParts[3] || "";
      return [title, company, duration, impact].filter(Boolean).join(" | ").trim();
    }

    return raw;
  }));
}

function normalizeCertificationInputLines(lines) {
  const baseLines = uniqueNormalizedLines(lines || []);
  if (!baseLines.length) return [];

  const certDateRegex = /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{4}\b|\b(?:19|20)\d{2}\b/i;
  const certUrlRegex = /(https?:\/\/[^\s|]+|www\.[^\s|]+)/i;

  return uniqueNormalizedLines(baseLines.map((line) => {
    const raw = String(line || "").replace(/\s+/g, " ").trim();
    if (!raw) return "";

    if (raw.includes("|")) {
      const structured = parseStructuredLine(raw, ["name", "details", "date", "link"]);
      const rawLink = String(structured.link || "").trim();
      const normalizedLink = rawLink ? (rawLink.startsWith("www.") ? `https://${rawLink}` : rawLink) : "";
      const dateFromDetails = !structured.date && certDateRegex.test(structured.details || "")
        ? (String(structured.details || "").match(certDateRegex)?.[0] || "")
        : "";
      const detailsWithoutDate = dateFromDetails
        ? String(structured.details || "").replace(certDateRegex, "").replace(/[\s|,\-–]+$/, "").trim()
        : String(structured.details || "").trim();

      return [structured.name, detailsWithoutDate, structured.date || dateFromDetails, normalizedLink]
        .filter(Boolean)
        .join(" | ")
        .trim();
    }

    const urlMatch = raw.match(certUrlRegex);
    const inlineUrl = urlMatch ? (urlMatch[0].startsWith("www.") ? `https://${urlMatch[0]}` : urlMatch[0]) : "";
    const trailingDateMatch = raw.match(new RegExp(`${certDateRegex.source}$`, "i"));
    if (trailingDateMatch) {
      const date = trailingDateMatch[0].trim();
      const name = raw
        .replace(new RegExp(`${certDateRegex.source}$`, "i"), "")
        .replace(certUrlRegex, "")
        .replace(/[\s|,\-–]+$/, "")
        .trim();
      return [name || raw, "", date, inlineUrl].filter(Boolean).join(" | ").trim();
    }

    return [raw.replace(certUrlRegex, "").trim(), "", "", inlineUrl].filter(Boolean).join(" | ");
  }));
}

function parseCertificationPreviewEntry(line) {
  const entry = parseStructuredLine(line, ["name", "details", "date", "link"]);
  const certDateRegex = /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{4}\b|\b(?:19|20)\d{2}\b/i;
  const certUrlRegex = /(https?:\/\/[^\s|]+|www\.[^\s|]+)/i;

  let name = String(entry.name || "").trim();
  let details = String(entry.details || "").trim();
  let date = String(entry.date || "").trim();
  let linkRaw = String(entry.link || "").trim();

  if (!linkRaw && details) {
    const detailUrl = details.match(certUrlRegex);
    if (detailUrl) {
      linkRaw = detailUrl[0];
      details = details.replace(certUrlRegex, "").replace(/[\s|,\-–]+$/, "").trim();
    }
  }

  if (!date && details) {
    const detailsDate = details.match(certDateRegex);
    if (detailsDate) {
      date = detailsDate[0].trim();
      details = details.replace(certDateRegex, "").replace(/[\s|,\-–]+$/, "").trim();
    }
  }

  if (!date && name) {
    const nameDate = name.match(new RegExp(`${certDateRegex.source}$`, "i"));
    if (nameDate) {
      date = nameDate[0].trim();
      name = name.replace(new RegExp(`${certDateRegex.source}$`, "i"), "").replace(/[\s|,\-–]+$/, "").trim();
    }
  }

  if (!name && entry.raw) {
    name = String(entry.raw).trim();
  }

  const linkUrl = /^(https?:\/\/|www\.)/i.test(linkRaw)
    ? (linkRaw.startsWith("www.") ? `https://${linkRaw}` : linkRaw)
    : "";

  return {
    name,
    details,
    date,
    linkUrl,
    linkLabel: linkUrl ? "Certificate" : (String(entry.link || "Certificate").trim() || "Certificate"),
  };
}

function normalizeAchievementInputLines(lines) {
  const baseLines = uniqueNormalizedLines(lines || []);
  if (!baseLines.length) return [];

  return uniqueNormalizedLines(baseLines.map((line) => {
    const raw = String(line || "").replace(/\s+/g, " ").trim();
    if (!raw) return "";

    if (raw.includes("|")) {
      const structured = parseStructuredLine(raw, ["title", "context", "year"]);
      return [structured.title, structured.context, structured.year]
        .filter(Boolean)
        .join(" | ")
        .trim();
    }

    const dashParts = raw.split(/\s*[-–]\s*/).map((part) => part.trim()).filter(Boolean);
    if (dashParts.length >= 2) {
      const title = dashParts[0] || "";
      const context = dashParts[1] || "";
      const year = dashParts[2] || "";
      return [title, context, year].filter(Boolean).join(" | ").trim();
    }

    return raw;
  }));
}

function renderBuilderActionButtons(sectionKey, index, sectionName, options = {}) {
  const { enableDelete = false, enableEdit = false } = options;
  const editButton = enableEdit
    ? `<button type="button" class="btn btn-ghost icon-action-btn" title="Edit ${escapeHtml(sectionName)}" aria-label="Edit ${escapeHtml(sectionName)}" onclick="editStructuredItemAt('${escapeHtml(sectionKey)}', ${index})">&#9998;</button>`
    : "";
  const deleteButton = enableDelete
    ? `<button type="button" class="btn btn-ghost icon-action-btn" title="Delete ${escapeHtml(sectionName)}" aria-label="Delete ${escapeHtml(sectionName)}" onclick="deleteStructuredItemAt('${escapeHtml(sectionKey)}', ${index})">&#128465;</button>`
    : "";
  if (!editButton && !deleteButton) return "";
  return `<div style="display:flex;gap:6px;align-items:center;">${editButton}${deleteButton}</div>`;
}

function renderStructuredSimpleCards(lines, labels, sectionName, emptyLabel = "", options = {}) {
  const sectionKey = String(options.sectionKey || sectionName || "").toLowerCase();
  const normalized = uniqueNormalizedLines(lines || []);
  if (!normalized.length) {
    return emptyLabel
      ? `<div style="background:var(--surface2);border-radius:10px;padding:10px 12px;color:var(--text3);font-size:13px;">${escapeHtml(emptyLabel)}</div>`
      : "";
  }

  return normalized.map((line, index) => {
    const entry = parseStructuredLine(line, labels);
    const primary = entry[labels[0]] || entry.raw || sectionName;
    const secondary = labels[1] ? (entry[labels[1]] || "") : "";
    const tertiary = labels.slice(2).map((key) => entry[key]).filter(Boolean).join(" | ");
    const quaternary = labels[3] ? (entry[labels[3]] || "") : "";
    const actions = renderBuilderActionButtons(sectionKey, index, sectionName, options);

    if (sectionKey === "certification") {
      const certLinkUrl = /^(https?:\/\/|www\.)/i.test(quaternary)
        ? (quaternary.startsWith("www.") ? `https://${quaternary}` : quaternary)
        : "";
      const certLinkLabel = certLinkUrl ? "Certificate" : (quaternary || "Certificate");
      return `
        <div class="education-structured-card certification-structured-card" data-structured-section="${escapeHtml(sectionName)}">
          <div class="certification-line-head">
            <div class="education-line-degree" data-structured-primary="true">${escapeHtml(primary)}</div>
            <div style="display:flex;align-items:center;gap:8px;">
              <div class="education-line-meta" data-structured-tertiary="true">${escapeHtml(tertiary)}</div>
              ${actions}
            </div>
          </div>
          <div class="certification-line-sub">
            <div class="education-line-sub" data-structured-secondary="true">${escapeHtml(secondary)}</div>
            ${certLinkUrl
              ? `<a class="certification-link-label" href="${escapeHtml(certLinkUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(certLinkLabel)}</a>`
              : `<div class="certification-link-label">${escapeHtml(certLinkLabel)}</div>`}
          </div>
          <div data-structured-quaternary="true" style="display:none;">${escapeHtml(quaternary)}</div>
        </div>`;
    }

    return `
      <div class="education-structured-card" data-structured-section="${escapeHtml(sectionName)}">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;">
          <div class="education-line-degree" data-structured-primary="true">${escapeHtml(primary)}</div>
          ${actions}
        </div>
        <div class="education-line-sub" data-structured-secondary="true">${escapeHtml(secondary)}</div>
        <div class="education-line-meta" data-structured-tertiary="true">${escapeHtml(tertiary)}</div>
      </div>`;
  }).join("");
}

function renderStructuredEducationCards(lines, emptyLabel = "", options = {}) {
  const normalized = normalizeEducationInputLines(lines || []);
  if (!normalized.length) {
    return emptyLabel
      ? `<div style="background:var(--surface2);border-radius:10px;padding:10px 12px;color:var(--text3);font-size:13px;">${escapeHtml(emptyLabel)}</div>`
      : "";
  }

  const filtered = normalized.filter((line) => {
    const entry = parseStructuredLine(line, ["degree", "institution", "year", "score"]);
    const raw = String(entry.raw || line || "").trim();
    const degree = String(entry.degree || "").trim();
    const institution = String(entry.institution || "").trim();
    const meta = [entry.year, entry.score].filter(Boolean).join(" | ").trim();
    const fragmentOnly = !institution && !meta && (/^(Education|Experience|Projects?|Skills?)$/i.test(degree) || degree.length <= 2);

    if (fragmentOnly) return false;
    if (!degree && !institution && !meta && raw.length <= 3) return false;
    return true;
  });

  return filtered.map((line, index) => {
    const entry = parseStructuredLine(line, ["degree", "institution", "year", "score"]);
    const degreeLooksInstitution = /(college|university|institute|school)\b/i.test(entry.degree || "") && !entry.institution;
    const degree = degreeLooksInstitution ? "Education" : (entry.degree || entry.raw || "Education");
    const institution = degreeLooksInstitution ? entry.degree : (entry.institution || "");
    const meta = [entry.year, entry.score].filter(Boolean).join(" | ");
    const editButton = options.enableEdit
      ? `<button type="button" class="btn btn-ghost icon-action-btn" title="Edit Education" aria-label="Edit Education" onclick="editEducationAt(${index})">&#9998;</button>`
      : "";
    const deleteButton = options.enableDelete
      ? `<button type="button" class="btn btn-ghost icon-action-btn" title="Delete Education" aria-label="Delete Education" onclick="deleteEducationAt(${index})">&#128465;</button>`
      : "";

    return `
      <div class="education-structured-card">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;">
          <div class="education-line-degree" data-education-line="true">${escapeHtml(degree)}</div>
          <div style="display:flex;gap:6px;align-items:center;">${editButton}${deleteButton}</div>
        </div>
        <div class="education-line-sub">${escapeHtml(institution)}</div>
        <div class="education-line-meta">${escapeHtml(meta)}</div>
      </div>`;
  }).join("");
}

function getBuilderEducationLinesFromCards() {
  const container = document.getElementById("builder-education-list");
  if (!container) return [];

  const cards = Array.from(container.querySelectorAll(".education-structured-card"));
  return cards
    .map((card) => {
      const degree = String(card.querySelector(".education-line-degree")?.textContent || "").trim();
      const institution = String(card.querySelector(".education-line-sub")?.textContent || "").trim();
      const meta = String(card.querySelector(".education-line-meta")?.textContent || "").trim();
      return [degree, institution, meta].filter(Boolean).join(" | ").trim();
    })
    .filter(Boolean);
}

function getBuilderStructuredLinesFromCards(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return [];

  const cards = Array.from(container.querySelectorAll("[data-structured-section]"));
  return cards
    .map((card) => {
      const primary = String(card.querySelector("[data-structured-primary='true']")?.textContent || "").trim();
      const secondary = String(card.querySelector("[data-structured-secondary='true']")?.textContent || "").trim();
      const tertiary = String(card.querySelector("[data-structured-tertiary='true']")?.textContent || "").trim();
      const quaternary = String(card.querySelector("[data-structured-quaternary='true']")?.textContent || "").trim();
      return [primary, secondary, tertiary, quaternary].filter(Boolean).join(" | ").trim();
    })
    .filter(Boolean);
}

function getBuilderProjectLinesFromCards() {
  const container = document.getElementById("builder-projects-list");
  if (!container) return [];

  const cards = Array.from(container.querySelectorAll(".project-structured-card"));
  const lines = [];

  cards.forEach((card) => {
    const headerEl = card.querySelector("[data-project-header='true']");
    const dateEl = card.querySelector(".project-line-date");
    const headerText = String(headerEl?.textContent || "").replace(/\s+/g, " ").trim();
    const dateText = String(dateEl?.textContent || "").trim();
    const fullHeader = [headerText, dateText].filter(Boolean).join(" ").trim();
    if (fullHeader) lines.push(fullHeader);

    const bullets = Array.from(card.querySelectorAll(".project-bullets li"))
      .map((li) => String(li.textContent || "").trim())
      .filter(Boolean)
      .map((bullet) => `- ${bullet}`);
    lines.push(...bullets);
  });

  return lines;
}

function normalizeProjectInputLines(lines) {
  const baseLines = uniqueNormalizedLines(lines || []);
  if (!baseLines.length) return [];

  const structured = parseStructuredProjects("", baseLines);
  if (!structured.length) return baseLines;
  return uniqueNormalizedLines(projectsToEditableLines(structured));
}

function normalizeProjectInputLinesStrict(lines) {
  const baseLines = uniqueNormalizedLines(lines || []);
  if (!baseLines.length) return [];

  const structured = parseStructuredProjects("", baseLines).map((project) => ({
    ...project,
    bullets: uniqueNormalizedLines(project.bullets || []).map((bullet) => enhanceBullet(bullet, "projects")),
  }));
  if (!structured.length) return baseLines;

  const strictLines = projectsToEditableLines(structured);
  const seen = new Set();
  return strictLines.filter((line) => {
    const key = String(line || "").trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getTextAreaLines(elementId) {
  const field = document.getElementById(elementId);
  if (!field) return [];

  return String(field.value || "")
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function getInputValue(elementId) {
  return String(document.getElementById(elementId)?.value || "").trim();
}

function clearInputValues(elementIds) {
  (elementIds || []).forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
}

function getStructuredSectionConfig(sectionKey) {
  const key = String(sectionKey || "").toLowerCase();
  const common = {
    experience: {
      sectionKey: "experience",
      containerId: "builder-experience-list",
      inputId: "builder-experience-input",
      labels: ["title", "company", "duration", "impact"],
      normalize: normalizeExperienceInputLines,
      fieldIds: ["builder-experience-role", "builder-experience-company", "builder-experience-duration", "builder-experience-impact"],
      stateField: "experience",
      addAction: "addExperience",
      sectionName: "Experience",
    },
    certification: {
      sectionKey: "certification",
      containerId: "builder-certifications-list",
      inputId: "builder-certifications-input",
      labels: ["name", "details", "date", "link"],
      normalize: normalizeCertificationInputLines,
      fieldIds: ["builder-cert-name", "builder-cert-provider", "builder-cert-year"],
      stateField: "certifications",
      addAction: "addCertification",
      sectionName: "Certification",
    },
    achievement: {
      sectionKey: "achievement",
      containerId: "builder-achievements-list",
      inputId: "builder-achievements-input",
      labels: ["title", "context", "year"],
      normalize: normalizeAchievementInputLines,
      fieldIds: ["builder-achievement-title", "builder-achievement-context", "builder-achievement-year"],
      stateField: "achievements",
      addAction: "addAchievement",
      sectionName: "Leadership / Extracurricular",
    },
  };
  return common[key] || null;
}

function getEditIndexBySection(sectionKey) {
  const key = String(sectionKey || "").toLowerCase();
  if (key === "experience") return experienceEditIndex;
  if (key === "certification") return certificationEditIndex;
  if (key === "achievement") return achievementEditIndex;
  if (key === "education") return educationEditIndex;
  return -1;
}

function setEditIndexBySection(sectionKey, index) {
  const key = String(sectionKey || "").toLowerCase();
  if (key === "experience") experienceEditIndex = index;
  if (key === "certification") certificationEditIndex = index;
  if (key === "achievement") achievementEditIndex = index;
  if (key === "education") educationEditIndex = index;
}

function setAddButtonMode(actionName, sectionLabel, isEditMode) {
  const btn = document.querySelector(`#page-create button[onclick='${actionName}()'], #page-builder button[onclick='${actionName}()']`);
  if (!btn) return;
  btn.textContent = isEditMode ? `Save ${sectionLabel}` : `Add ${sectionLabel}`;
}

function editStructuredItemAt(sectionKey, index) {
  if (blockGuestWriteAccess("editing resume details")) return;
  const config = getStructuredSectionConfig(sectionKey);
  if (!config) return;

  const existingLines = getBuilderStructuredLinesFromCards(config.containerId);
  const normalized = config.normalize(existingLines);
  if (!normalized.length || index < 0 || index >= normalized.length) {
    showToast(`${config.sectionName} not found.`, "warning");
    return;
  }

  const entry = parseStructuredLine(normalized[index], config.labels);
  config.fieldIds.forEach((id, idx) => {
    const key = config.labels[idx] || "";
    const el = document.getElementById(id);
    if (el) el.value = entry[key] || "";
  });

  setEditIndexBySection(config.sectionKey, index);
  setAddButtonMode(config.addAction, config.sectionName, true);
  showToast(`${config.sectionName} loaded for editing.`, "info");
}

function deleteStructuredItemAt(sectionKey, index) {
  if (blockGuestWriteAccess("deleting resume details")) return;
  const config = getStructuredSectionConfig(sectionKey);
  if (!config) return;

  const existingLines = getBuilderStructuredLinesFromCards(config.containerId);
  const normalized = config.normalize(existingLines);
  if (!normalized.length || index < 0 || index >= normalized.length) {
    showToast(`${config.sectionName} not found.`, "warning");
    return;
  }

  normalized.splice(index, 1);
  const nextLines = config.normalize(normalized);
  const container = document.getElementById(config.containerId);
  if (container) {
    container.innerHTML = renderStructuredSimpleCards(nextLines, config.labels, config.sectionName, "", {
      sectionKey: config.sectionKey,
      enableDelete: true,
      enableEdit: true,
    });
  }

  const input = document.getElementById(config.inputId);
  if (input) input.value = nextLines.join("\n");

  if (appState.generated_resume) appState.generated_resume[config.stateField] = nextLines;
  if (appState.resume_data) appState.resume_data[config.stateField] = nextLines;

  setEditIndexBySection(config.sectionKey, -1);
  setAddButtonMode(config.addAction, config.sectionName, false);
  savePersistentAppState();
  showToast(`${config.sectionName} deleted.`, "success");
}

function editEducationAt(index) {
  if (blockGuestWriteAccess("editing education")) return;
  const normalized = normalizeEducationInputLines(getBuilderEducationLinesFromCards());
  if (!normalized.length || index < 0 || index >= normalized.length) {
    showToast("Education not found.", "warning");
    return;
  }

  const entry = parseStructuredLine(normalized[index], ["degree", "institution", "year", "score"]);
  const degree = document.getElementById("builder-education-degree");
  const institution = document.getElementById("builder-education-institution");
  const year = document.getElementById("builder-education-year");
  const score = document.getElementById("builder-education-score");
  if (degree) degree.value = entry.degree || "";
  if (institution) institution.value = entry.institution || "";
  if (year) year.value = entry.year || "";
  if (score) score.value = entry.score || "";

  educationEditIndex = index;
  setAddButtonMode("addEducation", "Education", true);
  showToast("Education loaded for editing.", "info");
}

function deleteEducationAt(index) {
  if (blockGuestWriteAccess("deleting education")) return;
  const normalized = normalizeEducationInputLines(getBuilderEducationLinesFromCards());
  if (!normalized.length || index < 0 || index >= normalized.length) {
    showToast("Education not found.", "warning");
    return;
  }

  normalized.splice(index, 1);
  const nextLines = normalizeEducationInputLines(normalized);
  const educationList = document.getElementById("builder-education-list");
  if (educationList) {
    educationList.innerHTML = renderStructuredEducationCards(nextLines, "", { enableDelete: true, enableEdit: true });
  }
  const educationInput = document.getElementById("builder-education-input");
  if (educationInput) educationInput.value = nextLines.join("\n");

  if (appState.generated_resume) appState.generated_resume.education = nextLines;
  if (appState.resume_data) appState.resume_data.education = nextLines;

  educationEditIndex = -1;
  setAddButtonMode("addEducation", "Education", false);
  savePersistentAppState();
  showToast("Education deleted.", "success");
}

function addExperience() {
  if (blockGuestWriteAccess("adding experience")) return;
  const role = getInputValue("builder-experience-role");
  const company = getInputValue("builder-experience-company");
  const duration = getInputValue("builder-experience-duration");
  const impact = getInputValue("builder-experience-impact");
  const composedLine = [role, company, duration, impact].filter(Boolean).join(" | ").trim();
  const typedLines = composedLine ? [composedLine] : getTextAreaLines("builder-experience-input");
  const existingLines = normalizeExperienceInputLines(getBuilderStructuredLinesFromCards("builder-experience-list"));
  if (!typedLines.length) {
    showToast("Add structured experience details first.", "warning");
    return;
  }

  const normalized = [...existingLines];
  if (experienceEditIndex >= 0 && experienceEditIndex < normalized.length) {
    normalized[experienceEditIndex] = typedLines[0];
  } else {
    normalized.push(...typedLines);
  }
  const finalLines = normalizeExperienceInputLines(normalized);
  const experienceList = document.getElementById("builder-experience-list");
  if (experienceList) {
    experienceList.innerHTML = renderStructuredSimpleCards(finalLines, ["title", "company", "duration", "impact"], "Experience", "", {
      sectionKey: "experience",
      enableDelete: true,
      enableEdit: true,
    });
  }
  const experienceInput = document.getElementById("builder-experience-input");
  if (experienceInput) {
    experienceInput.value = finalLines.join("\n");
  }
  if (appState.generated_resume) {
    appState.generated_resume.experience = finalLines;
  }
  if (appState.resume_data) {
    appState.resume_data.experience = finalLines;
  }
  savePersistentAppState();
  clearInputValues(["builder-experience-role", "builder-experience-company", "builder-experience-duration", "builder-experience-impact"]);
  experienceEditIndex = -1;
  setAddButtonMode("addExperience", "Experience", false);
  showToast("Experience saved.", "success");
}

function addCertification() {
  if (blockGuestWriteAccess("adding certifications")) return;
  const certName = getInputValue("builder-cert-name");
  const certDetails = getInputValue("builder-cert-provider");
  const certDate = getInputValue("builder-cert-year");
  const composedLine = [certName, certDetails, certDate].filter(Boolean).join(" | ").trim();
  const typedLines = composedLine ? [composedLine] : getTextAreaLines("builder-certifications-input");
  const existingLines = normalizeCertificationInputLines(getBuilderStructuredLinesFromCards("builder-certifications-list"));
  if (!typedLines.length) {
    showToast("Add structured certification details first.", "warning");
    return;
  }

  const normalized = [...existingLines];
  if (certificationEditIndex >= 0 && certificationEditIndex < normalized.length) {
    normalized[certificationEditIndex] = typedLines[0];
  } else {
    normalized.push(...typedLines);
  }
  const finalLines = normalizeCertificationInputLines(normalized);
  const certList = document.getElementById("builder-certifications-list");
  if (certList) {
    certList.innerHTML = renderStructuredSimpleCards(finalLines, ["name", "details", "date", "link"], "Certification", "", {
      sectionKey: "certification",
      enableDelete: true,
      enableEdit: true,
    });
  }
  const certInput = document.getElementById("builder-certifications-input");
  if (certInput) {
    certInput.value = finalLines.join("\n");
  }
  if (appState.generated_resume) {
    appState.generated_resume.certifications = finalLines;
  }
  if (appState.resume_data) {
    appState.resume_data.certifications = finalLines;
  }
  savePersistentAppState();
  clearInputValues(["builder-cert-name", "builder-cert-provider", "builder-cert-year"]);
  certificationEditIndex = -1;
  setAddButtonMode("addCertification", "Certification", false);
  showToast("Certification saved.", "success");
}

function addAchievement() {
  if (blockGuestWriteAccess("adding leadership/extracurricular")) return;
  const title = getInputValue("builder-achievement-title");
  const context = getInputValue("builder-achievement-context");
  const year = getInputValue("builder-achievement-year");
  const composedLine = [title, context, year].filter(Boolean).join(" | ").trim();
  const typedLines = composedLine ? [composedLine] : getTextAreaLines("builder-achievements-input");
  const existingLines = normalizeAchievementInputLines(getBuilderStructuredLinesFromCards("builder-achievements-list"));
  if (!typedLines.length) {
    showToast("Add structured achievement details first.", "warning");
    return;
  }

  const normalized = [...existingLines];
  if (achievementEditIndex >= 0 && achievementEditIndex < normalized.length) {
    normalized[achievementEditIndex] = typedLines[0];
  } else {
    normalized.push(...typedLines);
  }
  const finalLines = normalizeAchievementInputLines(normalized);
  const achievementList = document.getElementById("builder-achievements-list");
  if (achievementList) {
    achievementList.innerHTML = renderStructuredSimpleCards(finalLines, ["title", "context", "year"], "Achievement", "", {
      sectionKey: "achievement",
      enableDelete: true,
      enableEdit: true,
    });
  }
  const achievementInput = document.getElementById("builder-achievements-input");
  if (achievementInput) {
    achievementInput.value = finalLines.join("\n");
  }
  if (appState.generated_resume) {
    appState.generated_resume.achievements = finalLines;
  }
  if (appState.resume_data) {
    appState.resume_data.achievements = finalLines;
  }
  savePersistentAppState();
  clearInputValues(["builder-achievement-title", "builder-achievement-context", "builder-achievement-year"]);
  achievementEditIndex = -1;
  setAddButtonMode("addAchievement", "Leadership / Extracurricular", false);
  showToast("Leadership / Extracurricular saved.", "success");
}

function addEducation() {
  if (blockGuestWriteAccess("adding education")) return;
  const degree = getInputValue("builder-education-degree");
  const institution = getInputValue("builder-education-institution");
  const year = getInputValue("builder-education-year");
  const score = getInputValue("builder-education-score");
  const composedLine = [degree, institution, year, score].filter(Boolean).join(" | ").trim();
  const typedLines = composedLine ? [composedLine] : getTextAreaLines("builder-education-input");
  const existingLines = normalizeEducationInputLines(getBuilderEducationLinesFromCards());
  if (!typedLines.length) {
    showToast("Add structured education details first.", "warning");
    return;
  }

  const normalized = [...existingLines];
  if (educationEditIndex >= 0 && educationEditIndex < normalized.length) {
    normalized[educationEditIndex] = typedLines[0];
  } else {
    normalized.push(...typedLines);
  }
  const finalLines = normalizeEducationInputLines(normalized);
  const educationList = document.getElementById("builder-education-list");
  if (educationList) {
    educationList.innerHTML = renderStructuredEducationCards(finalLines, "", { enableDelete: true, enableEdit: true });
  }
  const educationInput = document.getElementById("builder-education-input");
  if (educationInput) {
    educationInput.value = finalLines.join("\n");
  }
  clearInputValues(["builder-education-degree", "builder-education-institution", "builder-education-year", "builder-education-score"]);
  educationEditIndex = -1;
  setAddButtonMode("addEducation", "Education", false);
  if (appState.generated_resume) {
    appState.generated_resume.education = finalLines;
  }
  if (appState.resume_data) {
    appState.resume_data.education = finalLines;
  }
  savePersistentAppState();
  showToast("Education saved.", "success");
}

function addProject() {
  if (blockGuestWriteAccess("adding projects")) return;
  const project = buildProjectFromInputs();
  const hasProjectData = Boolean(project.title || project.tech || project.date || (project.bullets || []).length);
  if (!hasProjectData) {
    showToast("Add structured project details first.", "warning");
    return;
  }

  const existingLines = getBuilderProjectLinesFromCards();
  const structured = parseStructuredProjects("", normalizeProjectInputLinesStrict(existingLines));

  if (projectEditIndex >= 0 && projectEditIndex < structured.length) {
    structured[projectEditIndex] = {
      ...structured[projectEditIndex],
      ...project,
      bullets: project.bullets || [],
    };
  } else {
    structured.push(project);
  }

  const normalizedLines = normalizeProjectInputLinesStrict(projectsToEditableLines(structured));
  const finalProjects = parseStructuredProjects("", normalizedLines);
  const projectList = document.getElementById("builder-projects-list");
  if (projectList) {
    projectList.innerHTML = renderStructuredProjectCards(finalProjects, "", { enableDelete: true, enableEdit: true });
  }
  const projectsInput = document.getElementById("builder-projects-input");
  if (projectsInput) {
    projectsInput.value = normalizedLines.join("\n");
  }
  clearInputValues(["builder-project-title", "builder-project-tech", "builder-project-date", "builder-project-bullets"]);
  projectEditIndex = -1;
  const addButton = document.querySelector("#page-create button[onclick='addProject()'], #page-builder button[onclick='addProject()']");
  if (addButton) addButton.textContent = "Add Project";
  if (appState.generated_resume) {
    appState.generated_resume.projects = normalizedLines;
  }
  if (appState.resume_data) {
    appState.resume_data.projects = normalizedLines;
  }
  savePersistentAppState();
  showToast("Project added.", "success");
}

function autoFormatProjects() {
  const typedLines = getTextAreaLines("builder-projects-input");
  const existingLines = getBuilderProjectLinesFromCards();
  const sourceLines = existingLines.length ? existingLines : typedLines;
  if (!typedLines.length) {
    showToast("Add project text first.", "warning");
    return;
  }

  const formattedLines = normalizeProjectInputLinesStrict(sourceLines);
  const structured = parseStructuredProjects("", formattedLines);
  const projectList = document.getElementById("builder-projects-list");
  if (projectList) {
    projectList.innerHTML = renderStructuredProjectCards(structured, "", { enableDelete: true, enableEdit: true });
  }

  const projectsInput = document.getElementById("builder-projects-input");
  if (projectsInput) {
    projectsInput.value = formattedLines.join("\n");
  }

  if (appState.generated_resume) {
    appState.generated_resume.projects = formattedLines;
  }
  if (appState.resume_data) {
    appState.resume_data.projects = formattedLines;
  }

  savePersistentAppState();
  showToast("Projects auto-formatted.", "success");
}

function editProjectAt(index) {
  if (blockGuestWriteAccess("editing projects")) return;
  const typedProjectLines = getTextAreaLines("builder-projects-input");
  const existingProjectLines = getBuilderProjectLinesFromCards();
  const mergedProjectInput = normalizeProjectInputLinesStrict(existingProjectLines.length ? existingProjectLines : typedProjectLines);
  const structured = parseStructuredProjects("", mergedProjectInput);

  if (!structured.length || index < 0 || index >= structured.length) {
    showToast("Project not found.", "warning");
    return;
  }

  const project = structured[index];
  const titleField = document.getElementById("builder-project-title");
  const techField = document.getElementById("builder-project-tech");
  const dateField = document.getElementById("builder-project-date");
  const bulletsField = document.getElementById("builder-project-bullets");
  if (titleField) titleField.value = project.title || "";
  if (techField) techField.value = project.tech || "";
  if (dateField) dateField.value = project.date || "";
  if (bulletsField) bulletsField.value = (project.bullets || []).join("\n");

  projectEditIndex = index;
  const addButton = document.querySelector("#page-create button[onclick='addProject()'], #page-builder button[onclick='addProject()']");
  if (addButton) addButton.textContent = "Save Project";
  showToast("Project loaded for editing.", "info");
}

function deleteProjectAt(index) {
  if (blockGuestWriteAccess("deleting projects")) return;
  const typedProjectLines = getTextAreaLines("builder-projects-input");
  const existingProjectLines = getBuilderProjectLinesFromCards();
  const mergedProjectInput = normalizeProjectInputLinesStrict(existingProjectLines.length ? existingProjectLines : typedProjectLines);
  const structured = parseStructuredProjects("", mergedProjectInput);

  if (!structured.length || index < 0 || index >= structured.length) {
    showToast("Project not found.", "warning");
    return;
  }

  structured.splice(index, 1);
  const nextLines = structured.length ? normalizeProjectInputLinesStrict(projectsToEditableLines(structured)) : [];
  const projectList = document.getElementById("builder-projects-list");
  if (projectList) {
    projectList.innerHTML = renderStructuredProjectCards(parseStructuredProjects("", nextLines), "", { enableDelete: true, enableEdit: true });
  }

  const projectsInput = document.getElementById("builder-projects-input");
  if (projectsInput) {
    projectsInput.value = nextLines.join("\n");
  }

  if (appState.generated_resume) {
    appState.generated_resume.projects = nextLines;
  }
  if (appState.resume_data) {
    appState.resume_data.projects = nextLines;
  }

  savePersistentAppState();
  showToast("Project deleted.", "success");
}

function getBuilderResumeDraft() {
  const profileType = document.getElementById("builder-profile-type")?.value || "fresher";
  const name = (document.getElementById("builder-name")?.value || "").trim();
  const email = (document.getElementById("builder-email")?.value || "").trim();
  const phone = (document.getElementById("builder-phone")?.value || "").trim();
  const linkedin = (document.getElementById("builder-linkedin")?.value || "").trim();
  const github = (document.getElementById("builder-github")?.value || "").trim();
  const portfolio = (document.getElementById("builder-portfolio")?.value || "").trim();
  const summaryInput = (document.getElementById("builder-summary")?.value || "").trim();
  const courseworkInput = (document.getElementById("builder-coursework")?.value || "").trim();
  const skills = getBuilderSkills();
  const typedEducation = getTextAreaLines("builder-education-input");
  const typedProjects = getTextAreaLines("builder-projects-input");
  const typedExperience = getTextAreaLines("builder-experience-input");
  const typedCertifications = getTextAreaLines("builder-certifications-input");
  const typedAchievements = getTextAreaLines("builder-achievements-input");
  const listedEducation = getBuilderEducationLinesFromCards();
  const listedProjects = getBuilderProjectLinesFromCards();
  const listedExperience = getBuilderStructuredLinesFromCards("builder-experience-list");
  const listedCertifications = getBuilderStructuredLinesFromCards("builder-certifications-list");
  const listedAchievements = getBuilderStructuredLinesFromCards("builder-achievements-list");
  const education = normalizeEducationInputLines([...typedEducation, ...listedEducation]);
  const projects = normalizeProjectInputLinesStrict(listedProjects.length ? listedProjects : typedProjects);
  const experience = normalizeExperienceInputLines([...typedExperience, ...listedExperience]);
  const certifications = normalizeCertificationInputLines([...typedCertifications, ...listedCertifications]);
  const achievements = normalizeAchievementInputLines([...typedAchievements, ...listedAchievements]);
  const coursework = parseCourseworkItems(courseworkInput);

  return {
    profileType,
    name,
    email,
    phone,
    linkedin,
    github,
    portfolio,
    summaryInput,
    coursework,
    skills,
    education,
    projects,
    experience,
    certifications,
    achievements,
  };
}

function enhanceBullet(text, category) {
  const clean = String(text || "").trim().replace(/\.+$/, "");
  if (!clean) return "";

  if (/^(Built|Led|Developed|Designed|Implemented|Created|Delivered|Improved|Optimized|Managed|Engineered|Automated)\b/i.test(clean)) {
    return clean;
  }

  if (category === "experience") return `Delivered ${clean} with measurable quality improvements`;
  if (category === "projects") return `Built ${clean} with production-ready implementation and documentation`;
  if (category === "education") return clean;
  return clean;
}

function createSummary(profileType, baseSummary, skills, experiences, projects) {
  const summary = (baseSummary || "").trim();
  if (summary.length >= 40) return summary;

  const topSkills = skills.slice(0, 5).join(", ");
  if (profileType === "professional") {
    return `Results-driven software professional with hands-on experience delivering scalable applications. Strong in ${topSkills || "backend development, APIs, and cloud-ready architecture"}. Proven ability to own features end-to-end, collaborate across teams, and drive measurable impact in product delivery.`;
  }

  return `Motivated fresher with strong fundamentals in software engineering and practical project experience. Skilled in ${topSkills || "Python, web development, and problem solving"}. Built real-world projects and ready to contribute quickly with clean, maintainable, and testable code.`;
}

function getStructuredResumeData(options = {}) {
  const { withDefaults = false } = options;
  const baseResume = appState.generated_resume || appState.resume_data || {};
  const hasBuilderFields = !!document.getElementById("builder-name");
  const draft = hasBuilderFields ? getBuilderResumeDraft() : null;

  const profileType = draft?.profileType || baseResume.profile_type || "fresher";
  const name = (draft?.name || baseResume.name || "").trim();
  const email = (draft?.email || baseResume.email || "").trim();
  const phone = (draft?.phone || baseResume.phone || "").trim();
  const linkedin = (draft?.linkedin || baseResume.linkedin || "").trim();
  const github = (draft?.github || baseResume.github || "").trim();
  const portfolio = (draft?.portfolio || baseResume.portfolio || "").trim();

  const skills = normalizeList((draft?.skills && draft.skills.length) ? draft.skills : (baseResume.skills || appState.skills || []));
  const education = normalizeList((draft?.education && draft.education.length) ? draft.education : baseResume.education);
  const projects = normalizeList((draft?.projects && draft.projects.length) ? draft.projects : baseResume.projects);
  const experience = normalizeList((draft?.experience && draft.experience.length) ? draft.experience : baseResume.experience);
  const certifications = normalizeList((draft?.certifications && draft.certifications.length) ? draft.certifications : baseResume.certifications);
  const achievements = normalizeList((draft?.achievements && draft.achievements.length) ? draft.achievements : baseResume.achievements);
  const coursework = Array.isArray(draft?.coursework)
    ? draft.coursework
    : parseCourseworkItems(baseResume.coursework || []);

  const baseSummary = (draft?.summaryInput || baseResume.summary || "").trim();
  const summary = createSummary(profileType, baseSummary, skills, experience, projects);

  if (withDefaults) {
    return {
      profile_type: profileType,
      name: name || "Your Name",
      email: email || "email@example.com",
      phone: phone || "+91 00000 00000",
      linkedin,
      github,
      portfolio,
      summary,
      coursework,
      education: education.length ? education : ["Add your education details here"],
      skills,
      projects: projects.length ? projects : ["Add your best project here"],
      experience: experience.length ? experience : [],
      certifications,
      achievements,
      generated_at: new Date().toISOString(),
    };
  }

  return {
    profile_type: profileType,
    name,
    email,
    phone,
    linkedin,
    github,
    portfolio,
    summary,
    coursework,
    education,
    skills,
    projects,
    experience,
    certifications,
    achievements,
    generated_at: new Date().toISOString(),
  };
}

function updateResumeRequirementsHint() {
  const profileType = document.getElementById("builder-profile-type")?.value || "fresher";
  const hint = document.getElementById("resume-required-hint");
  if (!hint) return;

  if (profileType === "professional") {
    hint.textContent = "Required for Professional: Name, Email, Phone, Summary, at least 4 skills, at least 1 experience entry, and at least 1 education entry. Fill the Experience and Education fields below.";
    return;
  }

  hint.textContent = "Required for Fresher: Name, Email, Phone, Summary, at least 4 skills, at least 1 education entry, and at least 1 project entry. If you have internship experience, add it in the Experience field; otherwise leave it blank.";
}

function clearBuilderData() {
  if (blockGuestWriteAccess("clearing resume data")) return;
  const confirmed = window.confirm("Remove all Resume Builder data? This clears all current builder fields and saved draft content.");
  if (!confirmed) return;

  appState.resume_data = {};
  appState.generated_resume = null;
  appState.skills = [];
  appState.raw_text = "";
  appState.ats_data = null;
  appState.base_ats_data = null;
  appState.ai_rewrite = null;
  appState.job_data = { matches: [] };
  appState.opt_data = { optimized_skills: [], added_keywords: [], suggestions: [] };
  appState.career_data = { eligible: [], nearly_eligible: [], not_ready: [] };
  projectEditIndex = -1;
  educationEditIndex = -1;
  experienceEditIndex = -1;
  certificationEditIndex = -1;
  achievementEditIndex = -1;

  const inputIds = [
    "builder-name",
    "builder-email",
    "builder-phone",
    "builder-linkedin",
    "builder-github",
    "builder-portfolio",
    "builder-summary",
    "builder-coursework",
    "builder-experience-role",
    "builder-experience-company",
    "builder-experience-duration",
    "builder-experience-impact",
    "builder-education-degree",
    "builder-education-institution",
    "builder-education-year",
    "builder-education-score",
    "builder-project-title",
    "builder-project-tech",
    "builder-project-date",
    "builder-project-bullets",
    "builder-cert-name",
    "builder-cert-provider",
    "builder-cert-year",
    "builder-achievement-title",
    "builder-achievement-context",
    "builder-achievement-year",
    "builder-education-input",
    "builder-projects-input",
    "builder-experience-input",
    "builder-certifications-input",
    "builder-achievements-input",
    "new-skill",
  ];

  inputIds.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });

  const profileType = document.getElementById("builder-profile-type");
  if (profileType) profileType.value = "fresher";

  const skillsList = document.getElementById("skills-list");
  if (skillsList) skillsList.innerHTML = "";

  const educationList = document.getElementById("builder-education-list");
  if (educationList) educationList.innerHTML = "";

  const projectList = document.getElementById("builder-projects-list");
  if (projectList) projectList.innerHTML = "";

  const experienceList = document.getElementById("builder-experience-list");
  if (experienceList) experienceList.innerHTML = "";

  const certificationsList = document.getElementById("builder-certifications-list");
  if (certificationsList) certificationsList.innerHTML = "";

  const achievementsList = document.getElementById("builder-achievements-list");
  if (achievementsList) achievementsList.innerHTML = "";

  setAddButtonMode("addEducation", "Education", false);
  setAddButtonMode("addExperience", "Experience", false);
  setAddButtonMode("addCertification", "Certification", false);
  setAddButtonMode("addAchievement", "Leadership / Extracurricular", false);
  setAddButtonMode("addProject", "Project", false);

  document.querySelectorAll("#resume-template-selector, #resume-template-selector-shared").forEach((selector) => {
    selector.innerHTML = "";
  });

  document.querySelectorAll("#tab-preview .resume-preview, #tab-preview-shared .resume-preview").forEach((preview) => {
    preview.innerHTML = "";
  });

  updateResumeRequirementsHint();

  clearPersistentAppState();
  savePersistentAppState();
  switchTab("build");
  showToast("Resume builder data cleared.", "success");
}

function createNewResume() {
  if (blockGuestWriteAccess("creating resume")) return;
  const resumeData = getStructuredResumeData({ withDefaults: false });
  const profileType = resumeData.profile_type || "fresher";
  const { name, email, phone, linkedin, skills, education, projects, experience } = resumeData;

  const missing = [];
  if (!name) missing.push("Full Name");
  if (!email) missing.push("Email");
  if (!phone) missing.push("Phone");
  if (!(resumeData.summary || "").trim()) missing.push("Professional Summary");
  if (skills.length < 4) missing.push("Minimum 4 skills");

  if (profileType === "professional") {
    if (!experience.length) missing.push("At least 1 experience entry");
    if (!education.length) missing.push("At least 1 education entry");
  } else {
    if (!education.length) missing.push("At least 1 education entry");
    if (!projects.length) missing.push("At least 1 project entry");
  }

  if (missing.length) {
    alert(`Please complete these required fields for ${profileType}:\n- ${missing.join("\n- ")}`);
    return;
  }

  const generatedExperience = profileType === "fresher" && !experience.length
    ? []
    : experience;

  const generatedResume = {
    profile_type: profileType,
    name,
    email,
    phone,
    linkedin,
    github: resumeData.github || "",
    portfolio: resumeData.portfolio || "",
    summary: resumeData.summary,
    coursework: resumeData.coursework || [],
    education,
    projects,
    experience: generatedExperience,
    skills,
    certifications: resumeData.certifications || [],
    achievements: resumeData.achievements || [],
    generated_at: new Date().toISOString(),
  };

  appState.generated_resume = generatedResume;
  appState.skills = skills;
  savePersistentAppState();
  renderBuilder(appState);
  switchTab("preview");
}

function previewCurrentResume() {
  const generatedResume = getStructuredResumeData({ withDefaults: true });

  appState.generated_resume = generatedResume;
  appState.skills = generatedResume.skills || [];
  savePersistentAppState();
  renderBuilder(appState);
  switchTab("preview");
}

function safeResumeFileName(baseName, extension) {
  const cleaned = String(baseName || "Resume")
    .replace(/[^a-z0-9 _-]/gi, "")
    .trim()
    .replace(/\s+/g, "_");
  return `${cleaned || "Resume"}.${extension}`;
}

function getResumeExportData() {
  return getStructuredResumeData({ withDefaults: true });
}

function resumeToPlainText(resume) {
  const coursework = parseCourseworkItems(resume.coursework || []);
  const groupedSkills = groupTechnicalSkills(Array.isArray(resume.skills) ? resume.skills : []);

  const sections = [
    resume.name,
    [resume.email, resume.phone, resume.linkedin, resume.github, resume.portfolio].filter(Boolean).join(" | "),
    "",
    "SUMMARY",
    resume.summary || "",
    "",
    "EDUCATION",
    ...(Array.isArray(resume.education) ? resume.education : []),
    "",
    "RELEVANT COURSEWORK",
    ...(coursework.length ? coursework : []),
    "",
    "EXPERIENCE",
    ...(Array.isArray(resume.experience) ? resume.experience : []),
    "",
    "PROJECTS",
    ...(Array.isArray(resume.projects) ? resume.projects : []),
    "",
    "TECHNICAL SKILLS",
    `Languages: ${groupedSkills.languages.join(", ")}`,
    `Developer Tools: ${groupedSkills.tools.join(", ")}`,
    `Technologies/Frameworks: ${groupedSkills.frameworks.join(", ")}`,
    "",
    "CERTIFICATIONS",
    ...(Array.isArray(resume.certifications) ? resume.certifications : []),
    "",
    "LEADERSHIP / EXTRACURRICULAR",
    ...(Array.isArray(resume.achievements) ? resume.achievements : []),
  ];

  return sections.filter((line) => line !== undefined && line !== null).join("\n");
}

async function saveBlobWithPicker(blob, fileName, mimeType) {
  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: fileName,
        types: [{ description: fileName.split('.').pop().toUpperCase(), accept: { [mimeType]: [`.${fileName.split('.').pop()}`] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return true;
    } catch (error) {
      if (error && error.name === "AbortError") {
        return false;
      }
      console.warn("Save picker failed, using fallback download:", error);
    }
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  return true;
}

async function ensureJsPdfLoaded() {
  if (window.jspdf?.jsPDF) return window.jspdf.jsPDF;

  const existing = document.getElementById("jspdf-lib");
  if (existing) {
    await new Promise((resolve, reject) => {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", reject, { once: true });
    });
    if (!window.jspdf?.jsPDF) throw new Error("jsPDF load failed");
    return window.jspdf.jsPDF;
  }

  await new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.id = "jspdf-lib";
    script.src = "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js";
    script.async = true;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });

  if (!window.jspdf?.jsPDF) throw new Error("jsPDF load failed");
  return window.jspdf.jsPDF;
}

async function downloadResumePDF() {
  if (blockGuestWriteAccess("downloading resume")) return;
  try {
    const jsPDFCtor = await ensureJsPdfLoaded();
    const doc = new jsPDFCtor({ unit: "pt", format: "a4" });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 40;
    const maxWidth = pageWidth - margin * 2;
    let y = 48;

    const resume = getResumeExportData();

    const addWrapped = (text, fontSize = 11, bold = false, spacing = 16) => {
      if (!text) return;
      doc.setFont("helvetica", bold ? "bold" : "normal");
      doc.setFontSize(fontSize);
      const lines = doc.splitTextToSize(String(text), maxWidth);
      lines.forEach((line) => {
        if (y > pageHeight - 48) {
          doc.addPage();
          y = 48;
        }
        doc.text(line, margin, y);
        y += spacing;
      });
    };

    addWrapped(resume.name || "Resume", 18, true, 22);
    addWrapped([resume.email, resume.phone, resume.linkedin, resume.github, resume.portfolio].filter(Boolean).join(" | "), 10, false, 14);
    y += 6;

    const addSection = (title, items) => {
      addWrapped(title, 12, true, 16);
      if (Array.isArray(items)) {
        items.forEach((item) => addWrapped(`- ${item}`, 11, false, 14));
      } else {
        addWrapped(String(items || ""), 11, false, 14);
      }
      y += 8;
    };

    const groupedSkills = groupTechnicalSkills(Array.isArray(resume.skills) ? resume.skills : []);
    const coursework = parseCourseworkItems(resume.coursework || []);

    addSection("SUMMARY", resume.summary || "");
    addSection("EDUCATION", resume.education || []);
    addSection("RELEVANT COURSEWORK", coursework);
    addSection("EXPERIENCE", resume.experience || []);
    addSection("PROJECTS", resume.projects || []);
    addSection("TECHNICAL SKILLS", [
      `Languages: ${groupedSkills.languages.join(", ")}`,
      `Developer Tools: ${groupedSkills.tools.join(", ")}`,
      `Technologies/Frameworks: ${groupedSkills.frameworks.join(", ")}`,
    ]);
    addSection("CERTIFICATIONS", resume.certifications || []);
    addSection("LEADERSHIP / EXTRACURRICULAR", resume.achievements || []);

    const pdfBlob = doc.output("blob");
    const resumeName = resume.name || appState.generated_resume?.name || appState.resume_data?.name || "Resume";
    const fileName = safeResumeFileName(resumeName, "pdf");
    const saved = await saveBlobWithPicker(pdfBlob, fileName, "application/pdf");
    if (saved) {
      alert("PDF saved successfully.");
    }
  } catch (error) {
    console.error("PDF export failed:", error);
    alert("Unable to download PDF right now.");
  }
}

async function downloadResumeDOCX() {
  if (blockGuestWriteAccess("downloading resume")) return;
  try {
    const resume = getResumeExportData();
    const content = resumeToPlainText(resume);

    const blob = new Blob([content], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    const resumeName = resume.name || appState.generated_resume?.name || appState.resume_data?.name || "Resume";
    const fileName = safeResumeFileName(resumeName, "docx");
    const saved = await saveBlobWithPicker(blob, fileName, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    if (saved) {
      alert("DOCX saved successfully.");
    }
  } catch (error) {
    console.error("DOCX export failed:", error);
    alert("Unable to download DOCX right now.");
  }
}

async function copyResumeLink() {
  if (blockGuestWriteAccess("sharing resume")) return;
  const shareUrl = `${window.location.origin}${window.location.pathname}#tab-preview`;
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(shareUrl);
      alert("Link copied to clipboard.");
      return;
    }
  } catch (error) {
    console.warn("Clipboard write failed:", error);
  }

  const fallback = window.prompt("Copy this link:", shareUrl);
  if (fallback !== null) {
    alert("Link ready to copy.");
  }
}

/* ══════════════════════════════════════════
   FILE UPLOAD (FIXED)
══════════════════════════════════════════ */

// CLICK trigger
function triggerUpload(event) {
  if (blockGuestWriteAccess("file upload")) return;
  if (event) event.stopPropagation();
  const input = document.getElementById("resumeInput");
  if (input) input.click();
}

function bindResumeInput() {
  const input = document.getElementById("resumeInput");
  if (!input) return;
  input.onchange = handleFileSelect;
}

function bindDropZoneInteractions() {
  const dropZone = document.getElementById("dropZone");
  if (!dropZone) return;

  dropZone.ondragover = (e) => {
    e.preventDefault();
    dropZone.style.border = "2px dashed #6c63ff";
  };

  dropZone.ondragleave = () => {
    dropZone.style.border = "";
  };

  dropZone.ondrop = (e) => {
    e.preventDefault();
    dropZone.style.border = "";

    const file = e.dataTransfer.files[0];
    uploadFile(file);
  };
}

function ensureUploadZoneContent() {
  const dropZone = document.getElementById("dropZone");
  if (!dropZone) return;

  const hasCoreContent = !!dropZone.querySelector(".upload-zone-content")
    && !!dropZone.querySelector("#resumeInput")
    && !!dropZone.querySelector("#upload-status");

  if (!hasCoreContent) {
    renderUploadZoneContent();
  }

  bindResumeInput();
  bindDropZoneInteractions();
}

function renderUploadZoneContent() {
  const dropZone = document.getElementById("dropZone");
  if (!dropZone) return;

  const previousStatus = document.getElementById("upload-status")?.textContent || "";
  const previousButton = document.getElementById("upload-another-btn")?.textContent || "";
  const previousFileName = document.getElementById("uploaded-file-name")?.textContent || "";

  dropZone.innerHTML = `
    <div class="upload-zone-content">
      <div class="upload-icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6c63ff" stroke-width="2">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
          <polyline points="17 8 12 3 7 8"/>
          <line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
      </div>
      <div class="upload-title">Drop your resume here</div>
      <div class="upload-sub">PDF or DOCX · Max 5MB · ATS analysis after upload</div>
      <div style="margin-top:1rem;display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">
        <input type="file" id="resumeInput" accept=".pdf,.doc,.docx" hidden>
        <button id="upload-another-btn" class="btn btn-primary" type="button" onclick="triggerUpload(event)">Browse files</button>
      </div>
      <div id="uploaded-file-row" class="uploaded-file-row">
        <span class="uploaded-file-label">Uploaded file:</span>
        <span id="uploaded-file-name" class="uploaded-file-name">None</span>
      </div>
      <div id="upload-status" class="upload-status">Present uploaded resume: none</div>
    </div>
  `;

  if (previousStatus) setUploadStatus(previousStatus);
  if (previousButton) setUploadButtonLabel(previousButton);
  if (previousFileName) setUploadedFileName(previousFileName);

  bindResumeInput();
  bindDropZoneInteractions();
}

function setUploadStatus(message) {
  const status = document.getElementById("upload-status");
  if (status) status.textContent = message;

  const careerStatus = document.getElementById("career-upload-status");
  if (careerStatus) careerStatus.textContent = message;
}

function setUploadButtonLabel(label) {
  const button = document.getElementById("upload-another-btn");
  if (button) button.textContent = label;

  const careerButton = document.querySelector("#page-explorer .btn.btn-primary[onclick*='career-resume-input']");
  if (careerButton && label) careerButton.textContent = label;

  const fallbackButton = document.getElementById("upload-again-fallback");
  if (fallbackButton) fallbackButton.textContent = label === "Browse files" ? "Select file" : label;
}

function setUploadedFileName(name) {
  const value = name || "None";
  const fileNameEl = document.getElementById("uploaded-file-name");
  if (fileNameEl) fileNameEl.textContent = value;

  const careerFileNameEl = document.getElementById("career-uploaded-file-name");
  if (careerFileNameEl) careerFileNameEl.textContent = value;

  const fallbackNameEl = document.getElementById("uploaded-file-name-fallback");
  if (fallbackNameEl) fallbackNameEl.textContent = value;
}

// MAIN upload handler
async function uploadFile(file) {
  if (blockGuestWriteAccess("file upload")) return;
  if (!file || isUploading) return;

  const uploadSignature = `${file.name || "unknown"}:${file.size || 0}:${file.lastModified || 0}`;
  const now = Date.now();
  if (uploadSignature === lastUploadSignature && now - lastUploadAt < 2000) {
    return;
  }
  lastUploadSignature = uploadSignature;
  lastUploadAt = now;

  isUploading = true;
  setUploadButtonLabel("Browse files");
  setUploadedFileName(file.name || "None");
  setUploadStatus(`Uploading resume: ${file.name}...`);
  console.log("Uploading:", file.name);

  const formData = new FormData();
  formData.append("file", file);

  try {
    const res = await fetch(`${BACKEND_BASE_URL}/resume/analyze`, {
      method: "POST",
      body: formData
    });

    if (!res.ok) {
      let message = `Resume analysis failed with status ${res.status}`;
      try {
        const errorData = await res.json();
        if (errorData && errorData.detail) {
          message = errorData.detail;
        }
      } catch {
        const errorText = await res.text();
        if (errorText) {
          message = errorText;
        }
      }
      throw new Error(message);
    }

    const data = await res.json();
    const skills = data.skills || [];

    const jobData = await postJson(`${BACKEND_BASE_URL}/jobs/match`, skills);
    const careerData = await postJson(`${BACKEND_BASE_URL}/career/explore`, { matches: jobData.matches || [] });
    const topMatch = (jobData.matches || [])[0] || {};
    const jobSkills = Array.from(new Set([...(topMatch.missing_skills || []), ...skills]));
    const optData = await postJson(`${BACKEND_BASE_URL}/optimizer/optimize`, {
      user_skills: skills,
      job_skills: jobSkills,
    });

    const combined = {
      ...data,
      job_data: jobData,
      career_data: careerData,
      opt_data: optData,
    };

    const uploadLabel = String(data?.resume_data?.name || file?.name || "Uploaded Resume").trim();
    const atsScore = Number(data?.ats_data?.score ?? 0);
    await logUserSearch(uploadLabel, "resume_upload", Number.isFinite(atsScore) ? atsScore : 0);

    setUploadButtonLabel("Upload another");
    setUploadedFileName(uploadLabel);
    setUploadStatus(`Present uploaded resume: ${uploadLabel} • ATS Score: ${Number.isFinite(atsScore) ? atsScore : 0}`);

    Object.assign(appState, combined);
    appState.base_ats_data = data.ats_data || null;
    appState.ats_data = data.ats_data || null;
    console.log("Response:", combined);

    updateUI(combined);

    const jdInput = document.getElementById("ats-jd");
    const jobDescription = jdInput ? jdInput.value.trim() : "";
    if (jobDescription) {
      const jdAts = await runAtsScore(jobDescription, { silent: true });
      const jdScore = Number(jdAts?.score ?? atsScore);
      setUploadStatus(`Present uploaded resume: ${uploadLabel} • ATS Score (JD): ${Number.isFinite(jdScore) ? jdScore : 0}`);
    }

  } catch (err) {
    console.error("Upload error:", err);
    setUploadButtonLabel("Browse files");
    setUploadedFileName("None");
    setUploadStatus(`Present uploaded resume: none • Upload failed: ${err?.message || "Please try again."}`);
    alert(err?.message || "Backend not reachable");
  } finally {
    isUploading = false;
    const input = document.getElementById("resumeInput");
    if (input) input.value = "";
  }
}

// FILE SELECT
function handleFileSelect(event) {
  const file = event.target.files[0];
  uploadFile(file);
}

// UPDATE UI
function updateUI(data) {
  if (!data || !data.skills) return;
  const resumeData = data.resume_data || {};
  const extractedCertifications = normalizeCertificationInputLines(
    (resumeData.certifications && resumeData.certifications.length)
      ? resumeData.certifications
      : extractCertificationsFromRawText(data.raw_text || appState.raw_text || "")
  );
  if (extractedCertifications.length) {
    resumeData.certifications = extractedCertifications;
  }

  const setTextIfPresent = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };

  const setHtmlIfPresent = (id, html) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  };

  Object.assign(appState, data, {
    skills: data.skills || [],
    resume_data: resumeData,
    generated_resume: null,
    raw_text: data.raw_text || "",
    base_ats_data: data.ats_data || appState.base_ats_data,
    ats_data: data.ats_data || appState.ats_data,
    ai_rewrite: data.ai_rewrite || appState.ai_rewrite || null,
    job_data: data.job_data || appState.job_data,
    opt_data: data.opt_data || appState.opt_data,
    career_data: data.career_data || appState.career_data,
  });
  if (extractedCertifications.length) {
    appState.resume_data = appState.resume_data || {};
    appState.resume_data.certifications = extractedCertifications;
  }

  // 1. Populate Resume Analyzer Extracted Information
  setTextIfPresent("resume-name", resumeData.name || "Not extracted");
  setTextIfPresent("resume-email", resumeData.email || "Not extracted");
  setTextIfPresent("resume-phone", resumeData.phone || "Not extracted");
  setTextIfPresent("resume-summary", resumeData.summary || "Not extracted");
  setHtmlIfPresent("resume-education", resumeData.education && resumeData.education.length > 0
    ? resumeData.education.map((edu) => {
      const parsed = parseEducationPreviewEntry(edu);
      const title = parsed.institution || parsed.degree || String(edu?.raw || edu || "").trim();
      const sub = [parsed.degree, parsed.location, parsed.date || parsed.score].filter(Boolean).join(" | ");
      return `<div><strong>${escapeHtml(title)}</strong>${sub ? `<div style="font-size:12px;color:var(--text3);">${escapeHtml(sub)}</div>` : ""}</div>`;
    }).join("")
    : "");
  const analyzerProjects = parseStructuredProjects(data.raw_text || appState.raw_text || "", []);
  setHtmlIfPresent("resume-projects", renderStructuredProjectCards(analyzerProjects, ""));
  setHtmlIfPresent("resume-experience", resumeData.experience && resumeData.experience.length > 0
    ? resumeData.experience.map(exp => `<div>${exp}</div>`).join("")
    : "");

  const analyzerSkillsContainer = document.getElementById("resume-skills");
  if (analyzerSkillsContainer) {
    analyzerSkillsContainer.innerHTML = "";
    if (data.skills && data.skills.length > 0) {
      data.skills.forEach(skill => {
        const chip = document.createElement("span");
        chip.className = "chip";
        chip.textContent = skill;
        analyzerSkillsContainer.appendChild(chip);
      });
    } else {
      analyzerSkillsContainer.innerHTML = "<span class='chip'>No skills extracted yet</span>";
    }
  }

  // 2. Populate Resume Builder fields
  const builderName = document.getElementById("builder-name");
  if (builderName) builderName.value = resumeData.name || "";

  const builderEmail = document.getElementById("builder-email");
  if (builderEmail) builderEmail.value = resumeData.email || "";

  const builderPhone = document.getElementById("builder-phone");
  if (builderPhone) builderPhone.value = resumeData.phone || "";

  // LinkedIn/GitHub is not explicitly extracted by parser.py, so leave as is or try to infer
  // For now, we'll leave it blank or use a placeholder if needed.
  const builderLinkedIn = document.getElementById("builder-linkedin");
  if (builderLinkedIn) builderLinkedIn.value = ""; // Or try to parse from raw_text if available

  const builderSummary = document.getElementById("builder-summary");
  if (builderSummary) builderSummary.value = resumeData.summary || "";

  const builderSkillsList = document.getElementById("skills-list"); // This is the builder's skill list
  if (builderSkillsList) {
    builderSkillsList.innerHTML = "";
    if (data.skills && data.skills.length > 0) {
      data.skills.forEach(skill => {
        const chip = document.createElement("span");
        chip.className = "chip";
        chip.innerHTML = `${skill} <span class="chip-remove" onclick="removeChip(this)">×</span>`;
        builderSkillsList.appendChild(chip);
      });
    }
  }

  // Populate Education in Builder (assuming first entry for simplicity)
  // Populate Projects in Builder
  const builderProjectsList = document.getElementById("builder-projects-list");
  if (builderProjectsList) {
    const extractedProjects = getStructuredProjectsFromSource(resumeData.projects, data.raw_text || appState.raw_text || "");
    const builderProjects = extractedProjects.length ? extractedProjects : parseStructuredProjects(data.raw_text || appState.raw_text || "", []);
    builderProjectsList.innerHTML = renderStructuredProjectCards(builderProjects, "", { enableDelete: true, enableEdit: true });
  }

  const builderEducationList = document.getElementById("builder-education-list");
  if (builderEducationList) {
    builderEducationList.innerHTML = renderStructuredEducationCards(resumeData.education || [], "", { enableDelete: true, enableEdit: true });
  }

  // Populate Experience in Builder
  const builderExperienceList = document.getElementById("builder-experience-list");
  if (builderExperienceList) {
    builderExperienceList.innerHTML = renderStructuredSimpleCards(
      normalizeExperienceInputLines(resumeData.experience || []),
      ["title", "company", "duration", "impact"],
      "Experience",
      "",
      { sectionKey: "experience", enableDelete: true, enableEdit: true }
    );
  }

  const builderCertificationsList = document.getElementById("builder-certifications-list");
  if (builderCertificationsList) {
    builderCertificationsList.innerHTML = renderStructuredSimpleCards(
      extractedCertifications,
      ["name", "details", "date", "link"],
      "Certification",
      "",
      { sectionKey: "certification", enableDelete: true, enableEdit: true }
    );
  }

  const builderAchievementsList = document.getElementById("builder-achievements-list");
  if (builderAchievementsList) {
    builderAchievementsList.innerHTML = renderStructuredSimpleCards(
      normalizeAchievementInputLines(resumeData.achievements || []),
      ["title", "context", "year"],
      "Achievement",
      "",
      { sectionKey: "achievement", enableDelete: true, enableEdit: true }
    );
  }

  renderAtsChecker(appState);
  renderAllPages(appState);
  savePersistentAppState();
}

/* ══════════════════════════════════════════
   JD OPTIMIZER
══════════════════════════════════════════ */
async function analyzeJD() {
  if (blockGuestWriteAccess("JD analysis")) return;
  const jdInput = document.getElementById("jd-text");
  const resultCard = document.getElementById("jd-result");
  const skillsList = document.getElementById("skills-list");

  if (!jdInput || !resultCard) return;

  const jdText = jdInput.value.trim();
  if (!jdText) {
    alert("Please paste a job description first.");
    return;
  }

  const userSkills = skillsList
    ? Array.from(skillsList.querySelectorAll(".chip"))
        .map((chip) => chip.childNodes[0]?.textContent?.trim() || chip.textContent.trim().replace("×", "").trim())
        .filter(Boolean)
    : [];

  let jobSkills = [];
  try {
    const jdResponse = await fetch(`${BACKEND_BASE_URL}/resume/jd/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jd_text: jdText })
    });
    const jdData = await jdResponse.json();
    jobSkills = jdData.job_skills || [];
  } catch (jdError) {
    console.error("Error extracting skills from JD:", jdError);
    alert("Could not extract skills from Job Description. Please check the backend.");
    return;
  }

  try {
    const response = await fetch(`${BACKEND_BASE_URL}/optimizer/optimize`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        user_skills: userSkills,
        job_skills: jobSkills
      })
    });

    if (!response.ok) {
      throw new Error(`Optimizer request failed with status ${response.status}`);
    }

    const data = await response.json();
    const addedKeywords = data.added_keywords || [];
    const suggestions = data.suggestions || [];
    const optimizedSkills = data.optimized_skills || [];
    const matchedCount = Math.max(jobSkills.length - addedKeywords.length, 0);
    const matchScore = jobSkills.length ? Math.round((matchedCount / jobSkills.length) * 100) : 0;

    resultCard.innerHTML = `
      <div class="card-title">JD Match Analysis</div>
      <div style="display:flex;align-items:center;gap:1rem;margin-bottom:1.25rem;">
        <div class="score-ring" style="width:90px;height:90px;">
          <svg width="90" height="90" viewBox="0 0 90 90">
            <circle cx="45" cy="45" r="38" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="8"/>
            <circle cx="45" cy="45" r="38" fill="none" stroke="#6c63ff" stroke-width="8" stroke-dasharray="239" stroke-dashoffset="${239 - (239 * matchScore / 100)}" stroke-linecap="round"/>
          </svg>
          <div class="score-text">
            <div class="score-num" style="font-size:20px;">${matchScore}</div>
            <div class="score-lbl">JD match</div>
          </div>
        </div>
        <div>
          <div style="font-size:13px;color:var(--text2);margin-bottom:8px;">Keywords found: <strong style="color:var(--text1);">${matchedCount} / ${jobSkills.length}</strong></div>
          <span class="tag ${addedKeywords.length ? "tag-orange" : "tag-green"}">${addedKeywords.length} missing keywords</span>
        </div>
      </div>
      <div style="margin-bottom:12px;">
        <div style="font-size:12px;color:var(--text3);margin-bottom:6px;">MISSING KEYWORDS TO ADD</div>
        <div class="chip-list">
          ${addedKeywords.length ? addedKeywords.map((keyword) => `<span class="chip" style="border-color:rgba(255,101,132,0.3);color:var(--accent2);">${keyword}</span>`).join("") : `<span class="chip" style="border-color:rgba(67,233,123,0.3);color:var(--accent3);">No major gaps detected</span>`}
        </div>
      </div>
      <div class="divider"></div>
      <div style="font-size:12px;color:var(--text3);margin-bottom:8px;">AI ENHANCEMENTS</div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${suggestions.length ? suggestions.map((suggestion) => `<div style="font-size:12px;color:var(--text2);background:rgba(108,99,255,0.08);border:1px solid rgba(108,99,255,0.15);border-radius:8px;padding:10px;line-height:1.6;">${suggestion}</div>`).join("") : `<div style="font-size:12px;color:var(--text2);background:rgba(67,233,123,0.08);border:1px solid rgba(67,233,123,0.18);border-radius:8px;padding:10px;line-height:1.6;">Your current skills already align well with this job description.</div>`}
      </div>
      <button class="btn btn-primary" style="margin-top:12px;width:100%;justify-content:center;">Optimized skill set: ${optimizedSkills.length}</button>
    `;

    // Auto-apply JD optimization to builder resume data and open Preview.
    try {
      const baseResume = getStructuredResumeData({ withDefaults: true });
      const mergedSkills = uniqueNormalizedLines([
        ...(baseResume.skills || []),
        ...userSkills,
        ...optimizedSkills,
        ...jobSkills,
        ...addedKeywords,
      ]).slice(0, 36);

      const enriched = enrichResumeWithJDRequirements(baseResume, [...jobSkills, ...addedKeywords]);
      const summaryField = document.getElementById("builder-summary");
      const existingSummary = String(summaryField?.value || enriched.summary || "").trim();
      const keywordLine = addedKeywords.length
        ? `Experienced with: ${addedKeywords.slice(0, 6).join(", ")}.`
        : "";
      const tunedSummary = existingSummary
        || createSummary(baseResume.profile_type || "fresher", "", mergedSkills, enriched.experience || [], enriched.projects || []);

      const finalResume = {
        ...baseResume,
        ...enriched,
        summary: keywordLine ? `${tunedSummary}\n\n${keywordLine}`.trim() : tunedSummary,
        skills: mergedSkills,
      };

      appState.resume_data = finalResume;
      appState.generated_resume = finalResume;
      appState.skills = mergedSkills;
      appState.opt_data = {
        optimized_skills: optimizedSkills,
        added_keywords: addedKeywords,
        suggestions,
      };
      appState.raw_text = resumeToPlainText(finalResume);

      savePersistentAppState();
      renderBuilder(appState);
      switchTab("preview");
      showToast("JD customization applied. Preview updated resume.", "success");
    } catch (customizeError) {
      console.warn("Could not auto-apply JD customization:", customizeError);
    }

    await logUserSearch(jdText, "job_description", jobSkills.length);
  } catch (error) {
    console.error("JD analysis error:", error);
    alert("Unable to analyze the job description. Check whether the backend is running.");
  }
}

function setBuilderSkillsChips(skills = []) {
  const list = document.getElementById("skills-list");
  if (!list) return;

  const normalized = uniqueNormalizedLines(skills || []);
  list.innerHTML = normalized
    .map((skill) => `<span class="chip">${escapeHtml(skill)} <span class="chip-remove" onclick="removeChip(this)">×</span></span>`)
    .join("");
}

function getRequestedPageFromUrl() {
  const params = new URLSearchParams(window.location.search || "");
  const raw = String(params.get("page") || "").trim().toLowerCase();
  if (!raw) return "";

  const aliases = {
    dashboard: "dashboard",
    "resume-analyzer": "analyzer",
    analyzer: "analyzer",
    "career-explorer": "explorer",
    explorer: "explorer",
    "market-trends": "market",
    market: "market",
    "create-resume": "create",
    create: "create",
    "jd-optimize": "builder",
    builder: "builder",
    "jobs-for-you": "learning",
    learning: "learning",
    setting: "settings",
    settings: "settings",
    profile: "profile",
  };

  return aliases[raw] || "";
}

function enhanceResumeSectionWithJDKeywords(section, keywords = []) {
  if (!Array.isArray(section)) return section;
  if (!keywords.length) return section;

  return section.map((item) => {
    const itemStr = String(item || "").trim();
    if (!itemStr) return item;

    const keywordSet = new Set(keywords.map((k) => k.toLowerCase()));
    let hasKeyword = false;
    for (const keyword of keywordSet) {
      if (itemStr.toLowerCase().includes(keyword)) {
        hasKeyword = true;
        break;
      }
    }

    if (hasKeyword) return itemStr;

    for (const keyword of keywordSet) {
      if (/developed|built|created|implemented|designed/i.test(itemStr)) {
        return `${itemStr} using ${keyword}`;
      }
      if (/improved|optimized|enhanced|reduced/i.test(itemStr)) {
        return `${itemStr} with ${keyword}`;
      }
      if (/managed|led|coordinated/i.test(itemStr)) {
        return `${itemStr} involving ${keyword}`;
      }
    }

    return `${itemStr} | Key tech: ${keywords.slice(0, 3).join(", ")}`;
  });
}

function enrichResumeWithJDRequirements(resumeData, jdKeywords) {
  const enriched = { ...resumeData };
  const keywords = normalizeList(jdKeywords || []);

  enriched.experience = enhanceResumeSectionWithJDKeywords(resumeData.experience || [], keywords);
  enriched.projects = enhanceResumeSectionWithJDKeywords(resumeData.projects || [], keywords);
  enriched.achievements = enhanceResumeSectionWithJDKeywords(resumeData.achievements || [], keywords);

  return enriched;
}

async function optimizeBuilderResume95() {
  if (blockGuestWriteAccess("resume optimization")) return;
  const jdField = document.getElementById("builder-jd-text");
  const resultEl = document.getElementById("builder-jd-result");
  const summaryField = document.getElementById("builder-summary");

  if (!jdField || !resultEl) return;
  const jdText = String(jdField.value || "").trim();
  if (!jdText) {
    showToast("Paste a job description first.", "warning");
    return;
  }

  resultEl.innerHTML = "Analyzing JD and converting resume to structured ATS format...";

  try {
    const draft = getStructuredResumeData({ withDefaults: false });
    const jdData = await postJson(`${BACKEND_BASE_URL}/resume/jd/analyze`, { jd_text: jdText });
    const jobSkills = normalizeList(jdData?.job_skills || []);
    const userSkills = uniqueNormalizedLines(draft.skills || []);

    const optData = await postJson(`${BACKEND_BASE_URL}/optimizer/optimize`, {
      user_skills: userSkills,
      job_skills: jobSkills,
    });

    const suggestedKeywords = normalizeList(optData?.added_keywords || []).slice(0, 12);
    let boostedSkills = uniqueNormalizedLines([...userSkills, ...suggestedKeywords, ...jobSkills.slice(0, 8)]).slice(0, 30);
    setBuilderSkillsChips(boostedSkills);

    let enrichedResume = enrichResumeWithJDRequirements(draft, [...jobSkills, ...suggestedKeywords]);

    const experienceList = document.getElementById("builder-experience-list");
    if (experienceList && enrichedResume.experience && enrichedResume.experience.length) {
      experienceList.innerHTML = renderStructuredSimpleCards(
        normalizeExperienceInputLines(enrichedResume.experience),
        ["title", "company", "duration", "impact"],
        "Experience",
        "",
        { sectionKey: "experience", enableDelete: true, enableEdit: true }
      );
      const experienceInput = document.getElementById("builder-experience-input");
      if (experienceInput) {
        experienceInput.value = enrichedResume.experience.join("\n");
      }
    }

    const projectsList = document.getElementById("builder-projects-list");
    if (projectsList && enrichedResume.projects && enrichedResume.projects.length) {
      const enrichedProjects = parseStructuredProjects("", normalizeProjectInputLinesStrict(enrichedResume.projects));
      projectsList.innerHTML = renderStructuredProjectCards(enrichedProjects, "", { enableDelete: true, enableEdit: true });
      const projectsInput = document.getElementById("builder-projects-input");
      if (projectsInput) {
        projectsInput.value = enrichedResume.projects.join("\n");
      }
    }

    const achievementsList = document.getElementById("builder-achievements-list");
    if (achievementsList && enrichedResume.achievements && enrichedResume.achievements.length) {
      achievementsList.innerHTML = renderStructuredSimpleCards(
        normalizeAchievementInputLines(enrichedResume.achievements),
        ["title", "context", "year"],
        "Achievement",
        "",
        { sectionKey: "achievement", enableDelete: true, enableEdit: true }
      );
      const achievementsInput = document.getElementById("builder-achievements-input");
      if (achievementsInput) {
        achievementsInput.value = enrichedResume.achievements.join("\n");
      }
    }

    if (summaryField) {
      const existing = String(summaryField.value || "").trim();
      const keywordLine = suggestedKeywords.length
        ? `Experienced with: ${suggestedKeywords.slice(0, 6).join(", ")}.`
        : "";
      const tunedSummary = existing || createSummary(draft.profile_type || "fresher", "", boostedSkills, draft.experience || [], draft.projects || []);
      summaryField.value = keywordLine ? `${tunedSummary}\n\n${keywordLine}`.trim() : tunedSummary;
    }

    let structuredResume = getStructuredResumeData({ withDefaults: true });
    structuredResume.skills = boostedSkills;
    structuredResume.experience = enrichedResume.experience || structuredResume.experience;
    structuredResume.projects = enrichedResume.projects || structuredResume.projects;
    structuredResume.achievements = enrichedResume.achievements || structuredResume.achievements;
    appState.resume_data = structuredResume;
    appState.generated_resume = structuredResume;
    appState.skills = boostedSkills;
    appState.opt_data = optData || { optimized_skills: [], added_keywords: [], suggestions: [] };
    appState.raw_text = resumeToPlainText(structuredResume);

    let atsData = await runAtsScore(jdText, { silent: true, useResumeData: true });
    let score = Number(atsData?.score || 0);

    if (score < 95 && normalizeList(atsData?.missing_keywords || []).length) {
      const secondPassKeywords = normalizeList(atsData.missing_keywords).slice(0, 10);
      boostedSkills = uniqueNormalizedLines([...boostedSkills, ...secondPassKeywords]).slice(0, 36);
      setBuilderSkillsChips(boostedSkills);

      if (summaryField && secondPassKeywords.length) {
        const existing = String(summaryField.value || "").trim();
        const extraLine = `Additional key qualifications: ${secondPassKeywords.slice(0, 6).join(", ")}.`;
        if (!existing.toLowerCase().includes("additional")) {
          summaryField.value = `${existing}\n${extraLine}`.trim();
        }
      }

      structuredResume = getStructuredResumeData({ withDefaults: true });
      structuredResume.skills = boostedSkills;
      structuredResume.experience = enrichedResume.experience || structuredResume.experience;
      structuredResume.projects = enrichedResume.projects || structuredResume.projects;
      structuredResume.achievements = enrichedResume.achievements || structuredResume.achievements;
      appState.resume_data = structuredResume;
      appState.generated_resume = structuredResume;
      appState.skills = boostedSkills;
      appState.raw_text = resumeToPlainText(structuredResume);

      atsData = await runAtsScore(jdText, { silent: true, useResumeData: true });
      score = Number(atsData?.score || 0);
    }

    const finalScore = Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : 0;
    const status = finalScore >= 95 ? "Perfect ATS target reached (95+)." : "Structured resume improved. Continue tuning to push ATS to 95+.";
    const missing = normalizeList(atsData?.missing_keywords || []).slice(0, 8);

    resultEl.innerHTML = `
      <div style="font-size:14px;font-weight:700;color:${finalScore >= 95 ? 'var(--accent3)' : 'var(--accent4)'};margin-bottom:6px;">ATS Score: ${finalScore}%</div>
      <div style="font-size:12px;color:var(--text2);margin-bottom:8px;">${escapeHtml(status)}</div>
      <div style="font-size:12px;color:var(--text3);margin-bottom:6px;">Missing keywords</div>
      <div class="chip-list">${missing.length ? missing.map((k) => `<span class="chip" style="border-color:rgba(255,101,132,0.3);color:var(--accent2);">${escapeHtml(k)}</span>`).join("") : `<span class="chip" style="border-color:rgba(67,233,123,0.3);color:var(--accent3);">No critical gaps</span>`}</div>
    `;

    savePersistentAppState();
    renderBuilder(appState);
    switchTab("preview");
    showToast(finalScore >= 95 ? "AI optimization complete: ATS 95+ reached." : `AI optimization complete: ATS ${finalScore}%.`, "success");
  } catch (error) {
    console.error("Builder JD optimization error:", error);
    resultEl.textContent = "Could not optimize resume from JD right now. Check backend and try again.";
    showToast("JD optimization failed.", "error");
  }
}

/* ══════════════════════════════════════════
   INIT
══════════════════════════════════════════ */
document.addEventListener("DOMContentLoaded", () => {
  if (redirectToPreferredGoogleOriginIfNeeded()) {
    return;
  }

  // If index/main shell has no inline page sections, redirect to standalone page files.
  const hasInlinePages = !!document.querySelector('.main .page');
  if (!hasInlinePages) {
    const requestedPage = getRequestedPageFromUrl() || appState.current_page || 'dashboard';
    const targetFile = getStandalonePageFile(requestedPage) || 'dashboard.html';
    const currentFile = decodeURIComponent((window.location.pathname || '').split('/').pop() || '').toLowerCase();
    if (currentFile !== targetFile.toLowerCase()) {
      window.location.replace(targetFile);
      return;
    }
  }

  renderUploadZoneContent();

  const session = getStoredSession();
  if (session) {
    appState.profile = loadProfileState();
    renderAuthenticatedUser(session);
    setAppVisibility(true);
  } else {
    appState.profile = getDefaultProfile();
    setAppVisibility(false);
  }

  ensureUploadZoneContent();

  const profileType = document.getElementById("builder-profile-type");
  if (profileType) {
    profileType.addEventListener("change", updateResumeRequirementsHint);
  }

  updateResumeRequirementsHint();

  const savedAppState = session ? loadPersistentAppState() : null;
  if (savedAppState) {
    const jdInput = document.getElementById("ats-jd");
    if (jdInput) jdInput.value = "";
    const effectiveAts = savedAppState.base_ats_data || savedAppState.ats_data || null;

    Object.assign(appState, {
      current_page: savedAppState.current_page || "dashboard",
      ai_context: savedAppState.ai_context || { page: savedAppState.current_page || "dashboard", fieldId: "", updatedAt: Date.now() },
      resume_template: RESUME_TEMPLATES.includes(savedAppState.resume_template) ? savedAppState.resume_template : "jonathan",
      skills: Array.isArray(savedAppState.skills) ? savedAppState.skills : [],
      resume_data: savedAppState.resume_data || {},
      generated_resume: savedAppState.generated_resume || null,
      raw_text: savedAppState.raw_text || "",
      ats_view: savedAppState.ats_view === "focus" ? "focus" : "detailed",
      ats_data: effectiveAts,
      base_ats_data: savedAppState.base_ats_data || null,
      ai_rewrite: null,
      job_data: savedAppState.job_data || { matches: [] },
      opt_data: savedAppState.opt_data || { optimized_skills: [], added_keywords: [], suggestions: [] },
      career_data: savedAppState.career_data || { eligible: [], nearly_eligible: [], not_ready: [] },
    });

    const restoredData = {
      current_page: appState.current_page,
      skills: appState.skills,
      resume_data: appState.resume_data,
      raw_text: appState.raw_text,
      ats_data: appState.ats_data,
      job_data: appState.job_data,
      opt_data: appState.opt_data,
      ai_rewrite: appState.ai_rewrite,
      career_data: appState.career_data,
    };
    updateUI(restoredData);

    if (savedAppState.upload_status) {
      setUploadStatus(savedAppState.upload_status);
    }
    setUploadButtonLabel(savedAppState.upload_button || (appState.raw_text ? "Upload another" : "Browse files"));
    setUploadedFileName(savedAppState.uploaded_file_name || (appState.resume_data?.name || "None"));
  }

  renderAtsChecker(appState);
  renderAllPages(appState);
  const requestedPage = getRequestedPageFromUrl();
  const pageFromFile = getPageIdFromCurrentFile();
  if (pageFromFile) {
    appState.current_page = pageFromFile;
  }
  if (requestedPage) {
    appState.current_page = requestedPage;
    savePersistentAppState();
  }
  showPage(requestedPage || pageFromFile || appState.current_page || "dashboard");

  try {
    const rawPendingTab = sessionStorage.getItem('resumepro_pending_tab');
    if (rawPendingTab) {
      const pendingTab = JSON.parse(rawPendingTab);
      if (pendingTab && pendingTab.tabId && (!pendingTab.pageId || pendingTab.pageId === appState.current_page)) {
        switchTab(pendingTab.tabId);
        sessionStorage.removeItem('resumepro_pending_tab');
      }
    }
  } catch (_) {
    // Ignore malformed/blocked storage.
  }

  const aiContextTargets = new Set([
    "builder-summary",
    "builder-experience-input",
    "builder-projects-input",
    "builder-education-input",
    "new-skill",
    "profile-summary",
    "profile-skills",
    "profile-experience",
    "profile-education",
    "profile-projects",
    "profile-role",
  ]);

  document.addEventListener("focusin", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (aiContextTargets.has(target.id)) {
      const profileField = target.id.startsWith("profile-");
      setAiSuggestionContext(profileField ? "profile" : "builder", target.id);
      return;
    }
    if (target.closest("#ats-resume-editor")) {
      setAiSuggestionContext("analyzer", "ats-resume-editor");
    }
  });

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const fieldEl = target.closest("#builder-summary, #builder-experience-input, #builder-projects-input, #builder-education-input, #new-skill, #profile-summary, #profile-skills, #profile-experience, #profile-education, #profile-projects, #profile-role");
    if (fieldEl && fieldEl instanceof HTMLElement) {
      const profileField = fieldEl.id.startsWith("profile-");
      setAiSuggestionContext(profileField ? "profile" : "builder", fieldEl.id);
      return;
    }
    if (target.closest("#ats-resume-editor")) {
      setAiSuggestionContext("analyzer", "ats-resume-editor");
    }
  });

  if (session && appState.raw_text) {
    runAtsScore("", { silent: true }).then((atsData) => {
      if (!atsData) return;
      appState.base_ats_data = atsData;
      appState.ats_data = atsData;
      renderAtsChecker(appState);
      renderAllPages(appState);
      savePersistentAppState();
    });
  }

  // Initialize Google Sign-In
  initializeGoogleSignIn();

});

/**
 * Initialize Google Sign-In
 */
function initializeGoogleSignIn() {
  if (googleInitCompleted) return;
  if (googleInitStarted) {
    console.log('ℹ️ Google Sign-In initialization already in progress');
    return;
  }

  console.log('🔄 Initializing Google Sign-In...');
  console.log('Client ID:', GOOGLE_CLIENT_ID);
  console.log('Origin:', window.location.origin);
  
  const loginBtn = document.getElementById("google-login-button");
  const registerBtn = document.getElementById("google-register-button");
  
  if (!loginBtn || !registerBtn) {
    console.error('❌ Button containers not found');
    return;
  }

  // Check if Client ID is properly configured
  if (!GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID === "YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com") {
    console.warn('⚠️ Google OAuth Client ID not configured');
    showGoogleSetupMessage(loginBtn, registerBtn);
    return;
  }

  // Avoid Google 403 origin_mismatch by checking current origin before SDK init.
  if (!GOOGLE_ALLOWED_ORIGINS.includes(window.location.origin)) {
    console.warn('⚠️ Current origin is not in configured Google allowed origins');
    showGoogleOriginMismatchMessage(loginBtn, registerBtn);
    return;
  }

  googleInitStarted = true;

  // Wait for Google SDK to load
  if (typeof google === 'undefined' || !google || !google.accounts) {
    console.warn('⏳ Google SDK not ready yet; waiting for script load event');
    googleInitStarted = false;

    if (!googleSdkLoadListenerAttached) {
      const sdkScript = document.getElementById('google-gsi-script');
      if (sdkScript) {
        googleSdkLoadListenerAttached = true;
        sdkScript.addEventListener('load', () => {
          initializeGoogleSignIn();
        }, { once: true });
      }
    }

    // Fallback in case load event has already fired before listener attachment.
    if (googleInitRetryTimer) {
      clearTimeout(googleInitRetryTimer);
    }
    googleInitRetryTimer = setTimeout(() => {
      googleInitRetryTimer = null;
      initializeGoogleSignIn();
    }, 800);
    return;
  }

  try {
    console.log('✓ Google SDK found, initializing...');
    
    // Initialize Google ID service
    google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: handleGoogleLogin,
      auto_select: false,
      itp_support: true,
    });

    // Render Login Button
    if (loginBtn && loginBtn.children.length === 0) {
      console.log('📱 Rendering Google login button...');
      try {
        google.accounts.id.renderButton(loginBtn, {
          theme: "outline",
          size: "large",
          width: Math.max(220, Math.floor(loginBtn.getBoundingClientRect().width || 320)),
          text: "signin_with",
          locale: "en",
          logo_alignment: "left"
        });
        console.log('✓ Google login button rendered successfully');
      } catch (err) {
        console.error('Error rendering login button:', err);
        showGoogleFallbackButton(loginBtn);
      }
    }

    // Render Register Button
    if (registerBtn && registerBtn.children.length === 0) {
      console.log('📱 Rendering Google register button...');
      try {
        google.accounts.id.renderButton(registerBtn, {
          theme: "outline",
          size: "large",
          width: Math.max(220, Math.floor(registerBtn.getBoundingClientRect().width || 320)),
          text: "signup_with",
          locale: "en",
          logo_alignment: "left"
        });
        console.log('✓ Google register button rendered successfully');
      } catch (err) {
        console.error('Error rendering register button:', err);
        showGoogleFallbackButton(registerBtn);
      }
    }
    
    googleInitCompleted = true;
    googleInitStarted = false;

  } catch (error) {
    googleInitStarted = false;
    console.error("❌ Error initializing Google Sign-In:", error);
    showGoogleFallbackButton(loginBtn);
    showGoogleFallbackButton(registerBtn);
  }
}

function showGoogleOriginMismatchMessage(loginBtn, registerBtn) {
  const currentOrigin = window.location.origin;
  const approvedUrl = `${GOOGLE_PREFERRED_ORIGIN}/index.html`;
  const msg = `
    <div style="width:100%;box-sizing:border-box;padding:12px;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.25);border-radius:8px;text-align:center;">
      <div style="color:#f87171;font-size:13px;font-weight:700;margin-bottom:6px;">Google origin mismatch</div>
      <div style="color:var(--text3);font-size:11px;line-height:1.5;margin-bottom:8px;">
        Current: ${escapeHtml(currentOrigin)}<br/>
        Open approved URL: ${escapeHtml(approvedUrl)}
      </div>
      <button type="button" onclick="window.location.href='${escapeHtml(approvedUrl)}'" style="height:34px;padding:0 12px;border:1px solid rgba(99,102,241,0.35);border-radius:8px;background:rgba(99,102,241,0.12);color:var(--text1);font-size:12px;font-weight:600;cursor:pointer;">
        Open approved URL
      </button>
    </div>
  `;
  if (loginBtn) loginBtn.innerHTML = msg;
  if (registerBtn) registerBtn.innerHTML = msg;
}

/**
 * Show setup message when Client ID not configured
 */
function showGoogleSetupMessage(loginBtn, registerBtn) {
  const msg = `
    <div style="width:100%;box-sizing:border-box;padding:12px;background:rgba(99,102,241,0.1);border:1px solid rgba(99,102,241,0.2);border-radius:8px;text-align:center;">
      <div style="color:var(--accent);font-size:13px;font-weight:600;margin-bottom:6px;">⚙️ Google Sign-In Setup</div>
      <div style="color:var(--text3);font-size:11px;line-height:1.5;">
        1. Get Client ID from <a href="https://console.cloud.google.com/" target="_blank" style="color:var(--accent);text-decoration:underline;">Google Cloud Console</a><br/>
        2. Add to script.js line 22<br/>
        3. Reload this page
      </div>
    </div>
  `;
  if (loginBtn) loginBtn.innerHTML = msg;
  if (registerBtn) registerBtn.innerHTML = msg;
  console.info('📖 See GOOGLE_QUICK_SETUP.md for detailed instructions');
}

/**
 * Show fallback button if Google SDK fails
 */
function showGoogleFallbackButton(container) {
  if (!container) return;
  
  const fallback = `
    <button type="button" class="btn btn-google-fallback" onclick="showGoogleFallbackHelp()" style="width:100%;height:44px;border:1px solid var(--border2);border-radius:8px;background:var(--surface2);color:var(--text1);font-size:13px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;transition:all 0.3s;">
      <svg width="18" height="18" viewBox="0 0 24 24" style="fill:currentColor;">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
      </svg>
      Google Sign-In
    </button>
  `;
  container.innerHTML = fallback;
}

function showGoogleFallbackHelp() {
  showToast("Google Sign-In needs a valid Client ID and approved origin.", "warning");
}


/**
 * Handle Google Login Response
 * @param {Object} response - Google credential response with JWT token
 */
async function handleGoogleLogin(response) {
  try {
    // Decode JWT token (basic decoding without verification - for frontend only)
    // For production, verify the token on the backend
    const token = response.credential;
    const payload = parseJwt(token);

    if (!payload || !payload.email) {
      showToast("Failed to extract email from Google account", 'error');
      return;
    }

    // Extract user info from Google token
    const googleUser = {
      name: payload.name || payload.email.split('@')[0],
      email: payload.email.toLowerCase(),
      picture: payload.picture || '',
      email_verified: payload.email_verified || false,
      // Add a marker to indicate this is a Google-authenticated user
      provider: 'google',
      google_id: payload.sub
    };

    // Check if user exists
    const users = getStoredUsers();
    let existingUser = users.find(u => u.email === googleUser.email);

    if (existingUser) {
      // User already registered - login
      if (existingUser.provider === 'google' || existingUser.google_id) {
        // Existing Google user - just login
        saveSession({
          name: existingUser.name || googleUser.name,
          email: existingUser.email,
          provider: 'google'
        });
        await upsertBackendUser({
          name: existingUser.name || googleUser.name,
          email: existingUser.email,
          provider: "google",
        });
        showToast(`Welcome back, ${googleUser.name}!`, 'success');
      } else {
        // Email exists but with different provider
        showToast("An account with this email already exists. Please login with your password or use a different email.", 'warning');
        return;
      }
    } else {
      // New user - create account automatically
      const newUser = {
        name: googleUser.name,
        email: googleUser.email,
        password: '', // No password for Google users
        provider: 'google',
        google_id: googleUser.google_id,
        picture: googleUser.picture,
        email_verified: googleUser.email_verified
      };
      
      users.push(newUser);
      saveStoredUsers(users);
      saveSession({
        name: newUser.name,
        email: newUser.email,
        provider: 'google'
      });
      await upsertBackendUser({
        name: newUser.name,
        email: newUser.email,
        provider: "google",
      });
      showToast(`Welcome, ${googleUser.name}! Your account has been created.`, 'success');
    }

    // Complete login flow
    appState.profile = loadProfileState();
    renderAuthenticatedUser({ name: googleUser.name, email: googleUser.email });
    setAppVisibility(true);
    showPage("dashboard");
    renderAllPages(appState);
    window.scrollTo({ top: 0, behavior: "instant" });

  } catch (error) {
    console.error("Google login error:", error);
    showToast("Google login failed. Please try again.", 'error');
  }
}

/**
 * Parse JWT Token (Frontend Only - No Verification)
 * WARNING: For production, always verify tokens on your backend
 * @param {string} token - JWT token
 * @returns {Object} Decoded payload
 */
function parseJwt(token) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (error) {
    console.error("JWT parsing error:", error);
    return null;
  }
}

/**
 * Handle Google Logout
 */
function handleGoogleLogout() {
  if (typeof google !== 'undefined' && google.accounts && google.accounts.id) {
    google.accounts.id.disableAutoSelect();
  }
  clearSession();
  appState.profile = getDefaultProfile();
  setAppVisibility(false);
}

// Override the logoutUser function to handle Google logout
const originalLogoutUser = logoutUser;
window.logoutUser = function() {
  const session = getStoredSession();
  if (session && session.provider === 'google') {
    handleGoogleLogout();
  } else {
    originalLogoutUser();
  }
};
