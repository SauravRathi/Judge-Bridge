// ============================================================================
// SPOJ Submitter — Background Service Worker (Manifest V3)
// ============================================================================
// Core engine: session management, solution submission, verdict polling.
// Communicates with popup.js via chrome.runtime messaging.
//
// DESIGN: SPOJ blocks programmatic fetch() requests (403 due to WAF/bot
// protection checking Sec-Fetch-Mode headers). Instead, we use real browser
// navigation + DOM scraping via chrome.scripting.executeScript. This mimics
// a normal user navigating to pages and reading/submitting forms.
// ============================================================================

const SPOJ_BASE = "https://www.spoj.com";

// ---------------------------------------------------------------------------
// 0. TAB MANAGEMENT — Navigate real tabs to bypass WAF
// ---------------------------------------------------------------------------

/** ID of the dedicated background tab we use for SPOJ operations. */
let _workerTabId = null;

/**
 * Get (or create) a dedicated background tab for SPOJ operations.
 * NEVER uses the user's existing SPOJ tabs — always creates its own
 * hidden worker tab so the user's browsing is not disrupted.
 * @returns {Promise<number>} tabId
 */
async function getWorkerTab() {
  // Check if our dedicated worker tab still exists
  if (_workerTabId !== null) {
    try {
      await chrome.tabs.get(_workerTabId);
      return _workerTabId;
    } catch {
      _workerTabId = null;
    }
  }

  // Create a new background tab (active: false keeps it behind the user's current tab)
  const tab = await chrome.tabs.create({ url: SPOJ_BASE, active: false });
  _workerTabId = tab.id;
  await waitForTabComplete(tab.id);
  return _workerTabId;
}

/**
 * Navigate a tab to a URL and wait for it to finish loading.
 * Registers the onUpdated listener BEFORE triggering navigation to avoid races.
 * @param {number} tabId
 * @param {string} url
 * @returns {Promise<void>}
 */
function navigateAndWait(tabId, url) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error("Navigation timed out after 30s"));
    }, 30000);

    const listener = (updatedTabId, info) => {
      if (updatedTabId === tabId && info.status === "complete") {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };

    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.update(tabId, { url });
  });
}

/**
 * Reload a tab and wait for it to finish loading.
 * @param {number} tabId
 * @returns {Promise<void>}
 */
function reloadAndWait(tabId) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error("Reload timed out after 30s"));
    }, 30000);

    const listener = (updatedTabId, info) => {
      if (updatedTabId === tabId && info.status === "complete") {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };

    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.reload(tabId);
  });
}

/**
 * Wait for a tab to finish loading (used after chrome.tabs.create).
 * @param {number} tabId
 * @returns {Promise<void>}
 */
function waitForTabComplete(tabId) {
  return new Promise((resolve) => {
    const listener = (updatedTabId, info) => {
      if (updatedTabId === tabId && info.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}

// ---------------------------------------------------------------------------
// 1. SESSION MANAGER
// ---------------------------------------------------------------------------

/**
 * Validate the current SPOJ session by checking cookies directly.
 * We avoid fetching /myaccount/ because SPOJ's WAF blocks fetch() requests.
 * Instead, we check for the presence of session cookies.
 * @returns {Promise<{valid: boolean, username: string|null, error: string|null}>}
 */
async function validateSession() {
  try {
    const cookies = await chrome.cookies.getAll({ domain: ".spoj.com" });
    console.log("[DEBUG] validateSession: found", cookies.length, "cookies on .spoj.com");

    const spojCookie = cookies.find((c) => c.name === "SPOJ");
    const loginCookie = cookies.find((c) => c.name === "autologin_login");

    if (!spojCookie && !loginCookie) {
      // Also check bare domain
      const bareCookies = await chrome.cookies.getAll({ domain: "spoj.com" });
      const bareSpoj = bareCookies.find((c) => c.name === "SPOJ");
      const bareLogin = bareCookies.find((c) => c.name === "autologin_login");

      if (!bareSpoj && !bareLogin) {
        return {
          valid: false,
          username: null,
          error: "No SPOJ session found. Please log into SPOJ in a browser tab first.",
        };
      }

      const username = bareLogin ? bareLogin.value : null;
      console.log("[DEBUG] validateSession: valid (bare domain), username:", username);
      return { valid: true, username, error: null };
    }

    const username = loginCookie ? loginCookie.value : null;
    console.log("[DEBUG] validateSession: valid, username:", username);
    return { valid: true, username, error: null };
  } catch (err) {
    console.error("[DEBUG] validateSession error:", err);
    return { valid: false, username: null, error: `Error checking session: ${err.message}` };
  }
}

// ---------------------------------------------------------------------------
// 2. SUBMIT PAGE PARSER (Language IDs + Hidden Fields)
// ---------------------------------------------------------------------------

/**
 * Navigate to the SPOJ submit page for a problem and extract language options
 * and hidden form fields by reading the DOM directly.
 * @param {string} problemCode
 * @returns {Promise<{languages: {id: string, name: string}[], hiddenFields: Object, error: string|null}>}
 */
async function fetchSubmitPage(problemCode) {
  try {
    const tabId = await getWorkerTab();
    const submitUrl = `${SPOJ_BASE}/submit/${encodeURIComponent(problemCode)}/`;

    console.log("[DEBUG] fetchSubmitPage: navigating tab", tabId, "to", submitUrl);
    await navigateAndWait(tabId, submitUrl);

    // Read the DOM to extract languages and hidden fields
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        // Check if we got redirected to login
        if (
          document.querySelector('input[name="login_user"]') ||
          window.location.href.includes("/login")
        ) {
          return { languages: [], hiddenFields: {}, error: "Not logged in. Please log into SPOJ first." };
        }

        // Check for error/404 pages
        if (document.title.toLowerCase().includes("not found") ||
            document.title.toLowerCase().includes("error")) {
          return { languages: [], hiddenFields: {}, error: "Problem not found. Check the problem code." };
        }

        // Extract languages from <select name="lang">
        const select = document.querySelector('select[name="lang"]');
        if (!select) {
          return {
            languages: [],
            hiddenFields: {},
            error: "Could not find language selector. The problem code may be invalid.",
          };
        }

        const languages = [];
        for (const option of select.options) {
          if (option.value && /^\d+$/.test(option.value)) {
            languages.push({ id: option.value, name: option.textContent.trim() });
          }
        }

        // Extract hidden input fields (CSRF tokens, etc.)
        const hiddenFields = {};
        const form =
          document.querySelector('form[action*="submit"]') ||
          document.querySelector("form#submit") ||
          document.querySelector("form");
        if (form) {
          form.querySelectorAll('input[type="hidden"]').forEach((input) => {
            if (input.name) {
              hiddenFields[input.name] = input.value;
            }
          });
        }

        return { languages, hiddenFields, error: null };
      },
    });

    const result = results[0]?.result;
    if (!result) {
      return { languages: [], hiddenFields: {}, error: "Failed to read submit page." };
    }

    console.log("[DEBUG] fetchSubmitPage: found", result.languages?.length, "languages");
    return result;
  } catch (err) {
    console.error("[DEBUG] fetchSubmitPage error:", err);
    return { languages: [], hiddenFields: {}, error: `Error: ${err.message}` };
  }
}

// ---------------------------------------------------------------------------
// 3. SOLUTION SUBMITTER
// ---------------------------------------------------------------------------

/**
 * Submit a solution to SPOJ by navigating to the submit page, filling the
 * form via DOM manipulation, and submitting it.
 * @param {string} problemCode - e.g. "TEST"
 * @param {string} langId - numeric language ID from the dropdown
 * @param {string} sourceCode - raw source code string
 * @param {Object} hiddenFields - any hidden fields extracted from the submit page
 * @returns {Promise<{success: boolean, submissionId: string|null, error: string|null}>}
 */
async function submitSolution(problemCode, langId, sourceCode, hiddenFields = {}) {
  try {
    const tabId = await getWorkerTab();
    const submitUrl = `${SPOJ_BASE}/submit/${encodeURIComponent(problemCode)}/`;

    // Navigate to the submit page first
    console.log("[DEBUG] submitSolution: navigating to submit page...");
    await navigateAndWait(tabId, submitUrl);

    // Register the onUpdated listener BEFORE submitting the form to catch the navigation
    const formSubmitPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        reject(new Error("Form submission timed out after 30s"));
      }, 30000);

      const listener = (updatedTabId, info) => {
        if (updatedTabId === tabId && info.status === "complete") {
          clearTimeout(timeout);
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };

      chrome.tabs.onUpdated.addListener(listener);
    });

    // Fill and submit the form
    console.log("[DEBUG] submitSolution: filling form and submitting...");
    const fillResults = await chrome.scripting.executeScript({
      target: { tabId },
      func: (pCode, lId, src, hFields) => {
        try {
          const form =
            document.querySelector('form[action*="submit"]') ||
            document.querySelector("form#submit") ||
            document.querySelector("form");
          if (!form) return { submitted: false, error: "Could not find submit form on the page." };

          // Set problem code
          const codeInput = form.querySelector('input[name="problemcode"]');
          if (codeInput) codeInput.value = pCode;

          // Set language
          const langSelect = form.querySelector('select[name="lang"]');
          if (langSelect) langSelect.value = lId;

          // Set any hidden fields
          for (const [key, value] of Object.entries(hFields)) {
            let input = form.querySelector(`input[name="${key}"]`);
            if (!input) {
              input = document.createElement("input");
              input.type = "hidden";
              input.name = key;
              form.appendChild(input);
            }
            input.value = value;
          }

          // Create file upload from source code
          const fileInput = form.querySelector('input[type="file"][name="file"]') ||
                            form.querySelector('input[type="file"]');
          if (fileInput) {
            const dataTransfer = new DataTransfer();
            const file = new File([src], "solution.cpp", { type: "text/x-c++src" });
            dataTransfer.items.add(file);
            fileInput.files = dataTransfer.files;
          }

          // Submit — use prototype call because SPOJ has <input name="submit">
          // which shadows the form.submit() method
          HTMLFormElement.prototype.submit.call(form);
          return { submitted: true, error: null };
        } catch (e) {
          return { submitted: false, error: e.message };
        }
      },
      args: [problemCode, langId, sourceCode, hiddenFields],
    });

    const fillResult = fillResults[0]?.result;
    if (!fillResult || !fillResult.submitted) {
      return { success: false, submissionId: null, error: fillResult?.error || "Form fill/submit failed." };
    }

    // Wait for the form submission to navigate to the result page
    await formSubmitPromise;

    // Try to extract submission ID from the result page
    const idResults = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const bodyText = document.body ? document.body.innerText : "";
        const scriptText = document.documentElement ? document.documentElement.innerHTML : "";
        const match =
          scriptText.match(/newSubmissionId\s*=\s*(\d+)/i) ||
          scriptText.match(/submissionId\s*=\s*(\d+)/i) ||
          bodyText.match(/submission\s+id[:\s]*(\d+)/i);
        const urlMatch = window.location.href.match(/\/(\d{6,})/);
        return {
          submissionId: (match && match[1]) || (urlMatch && urlMatch[1]) || null,
          url: window.location.href,
        };
      },
    });

    const idResult = idResults[0]?.result;
    console.log("[DEBUG] submitSolution: result page URL:", idResult?.url, "| submissionId:", idResult?.submissionId);

    return { success: true, submissionId: idResult?.submissionId || null, error: null };
  } catch (err) {
    console.error("[DEBUG] submitSolution error:", err);
    return { success: false, submissionId: null, error: `Error: ${err.message}` };
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
 * Poll the SPOJ status page for the verdict of the latest submission.
 * Uses real tab navigation + DOM reading to bypass WAF restrictions.
 *
 * @param {string} username
 * @param {string} problemCode
 * @param {Object} opts - { interval: number (ms), maxPolls: number }
 * @returns {Promise<{id: string, status: string, time: string, mem: string, lang: string, error: string|null}>}
 */
async function pollVerdict(username, problemCode, opts = {}) {
  const interval = opts.interval || 3000;
  const maxPolls = opts.maxPolls || 60;
  const statusUrl = `${SPOJ_BASE}/status/${encodeURIComponent(problemCode)},${encodeURIComponent(username)}/`;

  const tabId = await getWorkerTab();

  for (let poll = 1; poll <= maxPolls; poll++) {
    try {
      // First poll: navigate; subsequent polls: reload
      if (poll === 1) {
        await navigateAndWait(tabId, statusUrl);
      } else {
        await reloadAndWait(tabId);
      }

      // Read the status table from DOM
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          // Collect all table rows with <td> cells
          const allRows = document.querySelectorAll("table tr");
          const dataRows = [];

          for (const row of allRows) {
            const cells = row.querySelectorAll("td");
            if (cells.length >= 4) {
              // Extract text from each cell, stripping HTML
              const cellTexts = Array.from(cells).map((c) => c.textContent.trim());
              dataRows.push(cellTexts);
            }
          }

          if (dataRows.length === 0) {
            return { row: null, debug: { url: window.location.href, title: document.title, tables: document.querySelectorAll("table").length, totalTRs: allRows.length } };
          }

          // The first data row should be the most recent submission
          const firstRow = dataRows[0];

          // Find the submission ID (first cell that's purely numeric)
          let id = "-";
          for (const cell of firstRow) {
            if (/^\d+$/.test(cell)) {
              id = cell;
              break;
            }
          }

          // Find the verdict/status cell by looking for known verdict keywords
          const verdictKeywords = ["accepted", "wrong", "time limit", "runtime", "compil", "running", "waiting", "judging", "memory limit", "internal", "output limit"];
          let statusText = "unknown";
          let statusIdx = -1;

          for (let i = 0; i < firstRow.length; i++) {
            const lower = firstRow[i].toLowerCase();
            for (const kw of verdictKeywords) {
              if (lower.includes(kw)) {
                statusText = firstRow[i];
                statusIdx = i;
                break;
              }
            }
            if (statusIdx !== -1) break;
          }

          // If no verdict keyword found, look for a cell with just a number (time)
          // and assume the cell before it is the status
          if (statusIdx === -1) {
            // Fallback: use index 3 or 4
            statusText = firstRow[3] || firstRow[4] || "unknown";
            statusIdx = 3;
          }

          // Extract time, memory, language from cells after the status
          const time = (statusIdx + 1 < firstRow.length) ? firstRow[statusIdx + 1] : "-";
          const mem = (statusIdx + 2 < firstRow.length) ? firstRow[statusIdx + 2] : "-";
          const lang = firstRow[firstRow.length - 1] || "-";

          return {
            row: { id, status: statusText, time, mem, lang },
            debug: { url: window.location.href, rowCount: dataRows.length, firstRow },
          };
        },
      });

      const parsed = results[0]?.result;
      console.log("[DEBUG] pollVerdict poll", poll, ":", JSON.stringify(parsed?.debug));
      const row = parsed?.row;

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
        status: `Error: ${err.message}`,
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
// 5. MESSAGE ROUTING (Service Worker ↔ Popup)
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

    default:
      sendResponse({ error: `Unknown action: ${action}` });
      return false;
  }
});

// Log that the service worker has started
console.log("[SPOJ Submitter] Background service worker initialized.");
