// ============================================================================
// SPOJ Submitter — Background Service Worker (Manifest V3)
// ============================================================================
// Core engine: session management, solution submission, verdict polling.
// Communicates with the React popup via chrome.runtime messaging.
// Also saves submissions to the Express backend for history tracking.
// ============================================================================

const SPOJ_BASE = "https://www.spoj.com";
const API_BASE = "http://localhost:5000/api";

// ---------------------------------------------------------------------------
// 1. SESSION MANAGER
// ---------------------------------------------------------------------------

/**
 * Retrieve all cookies for the SPOJ domain.
 * Queries both ".spoj.com" and "www.spoj.com" to cover all cookie scopes,
 * then deduplicates by cookie name.
 * @returns {Promise<chrome.cookies.Cookie[]>}
 */
async function getSpojCookies() {
  const [dotDomain, wwwDomain, urlBased] = await Promise.all([
    chrome.cookies.getAll({ domain: ".spoj.com" }),
    chrome.cookies.getAll({ domain: "www.spoj.com" }),
    chrome.cookies.getAll({ url: "https://www.spoj.com/" }),
  ]);

  // Deduplicate by name (prefer the most specific match)
  const seen = new Map();
  for (const c of [...urlBased, ...wwwDomain, ...dotDomain]) {
    if (!seen.has(c.name)) {
      seen.set(c.name, c);
    }
  }
  return Array.from(seen.values());
}

/**
 * Format an array of cookie objects into a `Cookie` header string.
 * @param {chrome.cookies.Cookie[]} cookies
 * @returns {string}
 */
function formatCookieHeader(cookies) {
  return cookies.map((c) => `${c.name}=${c.value}`).join("; ");
}

/**
 * Make an authenticated fetch to SPOJ.
 * In MV3 service workers, `credentials: "include"` works when we have
 * host_permissions. We also explicitly set the Cookie header as a belt-
 * and-suspenders approach.
 *
 * @param {string} url
 * @param {RequestInit} opts
 * @returns {Promise<Response>}
 */
async function spojFetch(url, opts = {}) {
  const cookies = await getSpojCookies();
  const cookieHeader = formatCookieHeader(cookies);

  const headers = new Headers(opts.headers || {});
  if (cookieHeader) {
    headers.set("Cookie", cookieHeader);
  }

  return fetch(url, {
    ...opts,
    headers,
    credentials: "include",
  });
}

/**
 * Validate the current SPOJ session.
 * Fetches /myaccount/ and checks whether we are redirected to the login page.
 * If valid, extracts the logged-in username.
 * @returns {Promise<{valid: boolean, username: string|null, error: string|null}>}
 */
async function validateSession() {
  try {
    const cookies = await getSpojCookies();
    if (!cookies || cookies.length === 0) {
      return { valid: false, username: null, error: "No SPOJ cookies found. Please log into SPOJ in a browser tab first." };
    }

    const resp = await spojFetch(`${SPOJ_BASE}/myaccount/`, {
      method: "GET",
      redirect: "follow",
    });

    const finalUrl = resp.url;
    // If redirected to /login or /, session is invalid
    if (finalUrl.includes("/login") || resp.status === 401 || resp.status === 403) {
      return { valid: false, username: null, error: "Session expired. Please log into SPOJ again." };
    }

    const html = await resp.text();

    // Try to extract the username from the page
    // SPOJ typically shows the username in the nav bar or profile area
    let username = null;

    // Look for pattern: <a href="/users/USERNAME"
    const userMatch = html.match(/\/users\/([a-zA-Z0-9_]+)/);
    if (userMatch) {
      username = userMatch[1];
    }

    // Fallback: look in the edit-profile link or similar
    if (!username) {
      const editMatch = html.match(/edit-profile.*?([a-zA-Z0-9_]+)/i);
      if (editMatch) {
        username = editMatch[1];
      }
    }

    // Fallback: try to parse from the myaccount page title or heading
    if (!username) {
      const titleMatch = html.match(/<title>([^<]*)<\/title>/i);
      if (titleMatch && titleMatch[1] && !titleMatch[1].toLowerCase().includes("login")) {
        // Sometimes the title has "SPOJ - Username"
        const parts = titleMatch[1].split("-").map((s) => s.trim());
        if (parts.length > 1) {
          username = parts[parts.length - 1];
        }
      }
    }

    if (!username) {
      // If we got a 200 and no redirect, session is probably valid even if
      // we can't parse the username. Ask the user to provide it.
      return { valid: true, username: null, error: null };
    }

    return { valid: true, username, error: null };
  } catch (err) {
    return { valid: false, username: null, error: `Network error: ${err.message}` };
  }
}

// ---------------------------------------------------------------------------
// 2. SUBMIT PAGE PARSER (Language IDs + Hidden Fields)
// ---------------------------------------------------------------------------

/**
 * Fetch the submit page for a given problem and extract:
 *  - Available languages from the <select> dropdown
 *  - Any hidden input fields (CSRF tokens, etc.)
 * @param {string} problemCode
 * @returns {Promise<{languages: {id: string, name: string}[], hiddenFields: Object, error: string|null}>}
 */
async function fetchSubmitPage(problemCode) {
  try {
    const resp = await spojFetch(`${SPOJ_BASE}/submit/${encodeURIComponent(problemCode)}/`, {
      method: "GET",
      redirect: "follow",
    });

    if (!resp.ok) {
      if (resp.status === 403 || resp.status === 401) {
        return { languages: [], hiddenFields: {}, error: "Session expired or access denied." };
      }
      return { languages: [], hiddenFields: {}, error: `HTTP ${resp.status}: Failed to load submit page.` };
    }

    const html = await resp.text();

    // Check if we were redirected to login
    if (resp.url.includes("/login") || html.includes('name="login_user"')) {
      return { languages: [], hiddenFields: {}, error: "Not logged in. Please log into SPOJ first." };
    }

    // Parse languages from <select name="lang"> ... </select>
    const languages = [];
    const selectMatch = html.match(/<select[^>]*name=["']lang["'][^>]*>([\s\S]*?)<\/select>/i);
    if (selectMatch) {
      const optionRegex = /<option\s+value=["'](\d+)["'][^>]*>(.*?)<\/option>/gi;
      let m;
      while ((m = optionRegex.exec(selectMatch[1])) !== null) {
        languages.push({ id: m[1], name: m[2].trim() });
      }
    }

    // Parse hidden input fields
    const hiddenFields = {};
    const hiddenRegex = /<input\s+type=["']hidden["']\s+name=["']([^"']+)["']\s+value=["']([^"']*)["'][^>]*>/gi;
    let hm;
    while ((hm = hiddenRegex.exec(html)) !== null) {
      hiddenFields[hm[1]] = hm[2];
    }

    // Also try the reverse attribute order (value before name)
    const hiddenRegex2 = /<input\s+type=["']hidden["']\s+value=["']([^"']*)["']\s+name=["']([^"']+)["'][^>]*>/gi;
    while ((hm = hiddenRegex2.exec(html)) !== null) {
      hiddenFields[hm[2]] = hm[1];
    }

    if (languages.length === 0) {
      return { languages: [], hiddenFields, error: "Could not parse language list. The submit page structure may have changed." };
    }

    return { languages, hiddenFields, error: null };
  } catch (err) {
    return { languages: [], hiddenFields: {}, error: `Network error: ${err.message}` };
  }
}

// ---------------------------------------------------------------------------
// 3. SOLUTION SUBMITTER
// ---------------------------------------------------------------------------

/**
 * Submit a solution to SPOJ.
 * @param {string} problemCode - e.g. "TEST"
 * @param {string} langId - numeric language ID from the dropdown
 * @param {string} sourceCode - raw source code string
 * @param {Object} hiddenFields - any hidden fields extracted from the submit page
 * @returns {Promise<{success: boolean, submissionId: string|null, error: string|null}>}
 */
async function submitSolution(problemCode, langId, sourceCode, hiddenFields = {}) {
  try {
    // Build multipart form data
    const formData = new FormData();

    // Add hidden fields first (CSRF tokens, etc.)
    for (const [key, value] of Object.entries(hiddenFields)) {
      formData.append(key, value);
    }

    // Core submission fields
    formData.append("problemcode", problemCode);
    formData.append("lang", langId);

    // Source code — SPOJ accepts it as a file upload or as a text field.
    // We send it as a Blob to simulate a file upload (field name: "file")
    const codeBlob = new Blob([sourceCode], { type: "text/x-c++src" });
    formData.append("file", codeBlob, "solution.cpp");

    formData.append("submit", "Submit!");

    const resp = await spojFetch(`${SPOJ_BASE}/submit/complete/`, {
      method: "POST",
      body: formData,
      redirect: "follow",
    });

    const responseUrl = resp.url;
    const responseText = await resp.text();

    // Check for error responses
    if (resp.status === 403 || resp.status === 401) {
      return { success: false, submissionId: null, error: "Session expired or access denied." };
    }

    if (responseUrl.includes("/login")) {
      return { success: false, submissionId: null, error: "Not logged in. Please log into SPOJ first." };
    }

    // Try to extract the submission ID from the response or redirect URL
    // SPOJ often redirects to /status/ or /submit/complete/ with a success message
    let submissionId = null;

    // Check if the response contains a submission ID
    const subIdMatch = responseText.match(/submissionId\s*=\s*(\d+)/i) ||
                       responseText.match(/newSubmissionId\s*=\s*(\d+)/i) ||
                       responseText.match(/"id"\s*:\s*(\d+)/);
    if (subIdMatch) {
      submissionId = subIdMatch[1];
    }

    // Also look in the URL
    const urlIdMatch = responseUrl.match(/\/(\d{6,})/);
    if (!submissionId && urlIdMatch) {
      submissionId = urlIdMatch[1];
    }

    // If no submission ID found but we got a 200, assume success
    // (the polling step will find the latest submission)
    if (resp.ok || resp.status === 302) {
      return { success: true, submissionId, error: null };
    }

    return { success: false, submissionId: null, error: `Unexpected response (HTTP ${resp.status}).` };
  } catch (err) {
    return { success: false, submissionId: null, error: `Network error: ${err.message}` };
  }
}

// ---------------------------------------------------------------------------
// 4. VERDICT POLLER
// ---------------------------------------------------------------------------

// Terminal verdict strings (normalized to lowercase for comparison)
const TERMINAL_VERDICTS = new Set([
  "accepted",
  "wrong answer",
  "time limit exceeded",
  "runtime error",
  "compilation error",
  "internal error",
  "memory limit exceeded",
  "output limit exceeded",
  "illegal syscall",
]);

/**
 * Check if a status string represents a terminal (final) verdict.
 * @param {string} status
 * @returns {boolean}
 */
function isTerminalVerdict(status) {
  const normalized = status.toLowerCase().trim();
  for (const verdict of TERMINAL_VERDICTS) {
    if (normalized.startsWith(verdict) || normalized.includes(verdict)) {
      return true;
    }
  }
  return false;
}

/**
 * Parse the SPOJ status page HTML and extract the latest submission row.
 * @param {string} html - raw HTML of the status page
 * @returns {{id: string, status: string, time: string, mem: string, lang: string}|null}
 */
function parseStatusRow(html) {
  // SPOJ status page has a table. We need to find the first data row.
  // The table structure typically has columns:
  // ID | Date | User | Problem | Result | Time | Mem | Lang

  // Find the status table — it's usually the main table with submission rows
  // Look for table rows with submission data (they contain numeric IDs in first column)
  const rowRegex = /<tr[^>]*class=["'][^"']*statustext[^"']*["'][^>]*>([\s\S]*?)<\/tr>/gi;
  let match = rowRegex.exec(html);

  if (!match) {
    // Fallback: try any table row that looks like it has submission data
    const fallbackRegex = /<tr[^>]*>\s*<td[^>]*>\s*<a[^>]*>(\d{5,})<\/a>\s*<\/td>([\s\S]*?)<\/tr>/gi;
    match = fallbackRegex.exec(html);
    if (match) {
      const cells = [];
      const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      const fullRow = match[0];
      let cm;
      while ((cm = cellRegex.exec(fullRow)) !== null) {
        // Strip HTML tags from cell content
        cells.push(cm[1].replace(/<[^>]*>/g, "").trim());
      }
      if (cells.length >= 5) {
        return {
          id: cells[0],
          status: cells[3] || cells[4] || "unknown",
          time: cells[4] || cells[5] || "-",
          mem: cells[5] || cells[6] || "-",
          lang: cells[6] || cells[7] || "-",
        };
      }
    }
    return null;
  }

  // Parse cells from the matched row
  const cells = [];
  const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
  let cm;
  while ((cm = cellRegex.exec(match[1])) !== null) {
    cells.push(cm[1].replace(/<[^>]*>/g, "").trim());
  }

  if (cells.length < 5) return null;

  // The result column position may vary. Typically:
  // [0]=ID, [1]=Date, [2]=User, [3]=Problem, [4]=Result, [5]=Time, [6]=Mem, [7]=Lang
  // But sometimes it's fewer columns. We'll look for the status text heuristically.
  let statusIdx = -1;
  for (let i = 3; i < cells.length; i++) {
    const cell = cells[i].toLowerCase();
    if (
      cell.includes("accepted") || cell.includes("wrong") || cell.includes("time limit") ||
      cell.includes("runtime") || cell.includes("compil") || cell.includes("running") ||
      cell.includes("waiting") || cell.includes("internal") || cell.includes("memory limit") ||
      cell === "" // sometimes the status cell is temporarily empty during compilation
    ) {
      statusIdx = i;
      break;
    }
  }

  if (statusIdx === -1) statusIdx = 4; // fallback to column index 4

  return {
    id: cells[0],
    status: cells[statusIdx] || "unknown",
    time: cells[statusIdx + 1] || "-",
    mem: cells[statusIdx + 2] || "-",
    lang: cells[statusIdx + 3] || cells[cells.length - 1] || "-",
  };
}

/**
 * Poll the SPOJ status page for the verdict of the latest submission.
 * Sends progress messages to the popup via chrome.runtime.sendMessage.
 *
 * @param {string} username
 * @param {string} problemCode
 * @param {Object} opts - { interval: number (ms), maxPolls: number }
 * @returns {Promise<{id: string, status: string, time: string, mem: string, lang: string, error: string|null}>}
 */
async function pollVerdict(username, problemCode, opts = {}) {
  const interval = opts.interval || 3000;
  const maxPolls = opts.maxPolls || 60;

  // Build the status URL — SPOJ supports filtering by problem and user
  const statusUrl = `${SPOJ_BASE}/status/${encodeURIComponent(problemCode)},${encodeURIComponent(username)}/`;

  for (let poll = 1; poll <= maxPolls; poll++) {
    try {
      const resp = await spojFetch(statusUrl, {
        method: "GET",
      });

      if (!resp.ok) {
        // Send error update but keep trying
        broadcastUpdate({
          type: "POLL_UPDATE",
          poll,
          maxPolls,
          status: `HTTP error ${resp.status}`,
          terminal: false,
        });
        await sleep(interval);
        continue;
      }

      const html = await resp.text();
      const row = parseStatusRow(html);

      if (!row) {
        broadcastUpdate({
          type: "POLL_UPDATE",
          poll,
          maxPolls,
          status: "Waiting for submission to appear...",
          terminal: false,
        });
        await sleep(interval);
        continue;
      }

      const terminal = isTerminalVerdict(row.status);

      broadcastUpdate({
        type: "POLL_UPDATE",
        poll,
        maxPolls,
        ...row,
        terminal,
      });

      if (terminal) {
        return { ...row, error: null };
      }
    } catch (err) {
      broadcastUpdate({
        type: "POLL_UPDATE",
        poll,
        maxPolls,
        status: `Network error: ${err.message}`,
        terminal: false,
      });
    }

    await sleep(interval);
  }

  return {
    id: "-",
    status: "Polling timed out",
    time: "-",
    mem: "-",
    lang: "-",
    error: `Verdict not received after ${maxPolls} polls (${(maxPolls * interval) / 1000}s). Check SPOJ manually.`,
  };
}

/**
 * Broadcast a message to the popup (if it's open).
 */
function broadcastUpdate(message) {
  chrome.runtime.sendMessage(message).catch(() => {
    // Popup might be closed — ignore
  });
}

/**
 * Async sleep helper.
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// 5. BACKEND INTEGRATION (Express API)
// ---------------------------------------------------------------------------

/**
 * Save a submission record to the Express backend.
 * Fire-and-forget — does not block the submission flow.
 *
 * @param {Object} data - Submission data to save
 * @returns {Promise<{success: boolean, error: string|null}>}
 */
async function saveSubmission(data) {
  try {
    const resp = await fetch(`${API_BASE}/submissions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!resp.ok) {
      const body = await resp.json().catch(() => ({}));
      console.warn("[SPOJ Submitter] Failed to save submission:", body.error || resp.status);
      return { success: false, error: body.error || `HTTP ${resp.status}` };
    }

    const result = await resp.json();
    console.log("[SPOJ Submitter] Submission saved:", result.data?._id);
    return { success: true, error: null };
  } catch (err) {
    // Backend might be offline — log but don't fail
    console.warn("[SPOJ Submitter] Backend unreachable:", err.message);
    return { success: false, error: err.message };
  }
}

// ---------------------------------------------------------------------------
// 6. MESSAGE ROUTING (Service Worker ↔ Popup)
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const { action } = message;

  switch (action) {
    case "VALIDATE_SESSION":
      validateSession().then(sendResponse);
      return true; // keep channel open for async response

    case "FETCH_LANGUAGES":
      fetchSubmitPage(message.problemCode).then(sendResponse);
      return true;

    case "SUBMIT": {
      const { problemCode, langId, sourceCode, hiddenFields } = message;
      submitSolution(problemCode, langId, sourceCode, hiddenFields).then(sendResponse);
      return true;
    }

    case "POLL_VERDICT": {
      const { username, problemCode, interval, maxPolls } = message;
      pollVerdict(username, problemCode, { interval, maxPolls }).then(sendResponse);
      return true;
    }

    case "SAVE_SUBMISSION": {
      saveSubmission(message.data).then(sendResponse);
      return true;
    }

    default:
      sendResponse({ error: `Unknown action: ${action}` });
      return false;
  }
});

// Log that the service worker has started
console.log("[SPOJ Submitter] Background service worker initialized.");
