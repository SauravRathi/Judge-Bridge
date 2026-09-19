// ============================================================================
// SPOJ Submitter — Popup Controller
// ============================================================================
// Manages the extension popup UI: session validation, language fetching,
// submission dispatch, and live verdict rendering.
// ============================================================================

// --- DOM Elements ---
const dom = {
  sessionIndicator: document.getElementById("session-indicator"),
  sessionLabel: document.getElementById("session-label"),
  problemCode: document.getElementById("problem-code"),
  languageSelect: document.getElementById("language-select"),
  sourceCode: document.getElementById("source-code"),
  lineNumbers: document.getElementById("line-numbers"),
  submitBtn: document.getElementById("submit-btn"),
  submitBtnText: document.getElementById("submit-btn-text"),
  submitSpinner: document.getElementById("submit-spinner"),
  verdictPanel: document.getElementById("verdict-panel"),
  verdictClose: document.getElementById("verdict-close"),
  verdictProgressBar: document.getElementById("verdict-progress-bar"),
  verdictStatus: document.getElementById("verdict-status"),
  verdictStatusIcon: document.getElementById("verdict-status-icon"),
  verdictStatusText: document.getElementById("verdict-status-text"),
  verdictDetails: document.getElementById("verdict-details"),
  verdictId: document.getElementById("verdict-id"),
  verdictTime: document.getElementById("verdict-time"),
  verdictMem: document.getElementById("verdict-mem"),
  verdictLang: document.getElementById("verdict-lang"),
  errorToast: document.getElementById("error-toast"),
  errorToastText: document.getElementById("error-toast-text"),
};

// --- State ---
let state = {
  sessionValid: false,
  username: null,
  hiddenFields: {},
  isSubmitting: false,
  fetchDebounceTimer: null,
};

// --- Helpers ---

/**
 * Send a message to the background service worker and await the response.
 */
function sendMessage(msg) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

/**
 * Show an error toast for a few seconds.
 */
function showError(text) {
  dom.errorToastText.textContent = text;
  dom.errorToast.hidden = false;
  clearTimeout(showError._timer);
  showError._timer = setTimeout(() => {
    dom.errorToast.hidden = true;
  }, 6000);
}

/**
 * Update line numbers in the code area to match the textarea content.
 */
function updateLineNumbers() {
  const lines = dom.sourceCode.value.split("\n").length;
  const nums = [];
  for (let i = 1; i <= lines; i++) nums.push(i);
  dom.lineNumbers.textContent = nums.join("\n");
}

/**
 * Sync scroll position of line numbers with textarea.
 */
function syncScroll() {
  dom.lineNumbers.scrollTop = dom.sourceCode.scrollTop;
}

/**
 * Determine the verdict class and icon for a given status string.
 */
function getVerdictMeta(status) {
  const s = status.toLowerCase();
  if (s.includes("accepted"))
    return { cls: "ac", icon: "✅", color: "var(--verdict-ac)" };
  if (s.includes("wrong answer"))
    return { cls: "wa", icon: "❌", color: "var(--verdict-wa)" };
  if (s.includes("time limit"))
    return { cls: "tle", icon: "⏱️", color: "var(--verdict-tle)" };
  if (s.includes("memory limit"))
    return { cls: "mle", icon: "💾", color: "var(--verdict-tle)" };
  if (s.includes("runtime error"))
    return { cls: "re", icon: "💥", color: "var(--verdict-wa)" };
  if (s.includes("compilation error"))
    return { cls: "ce", icon: "⚠️", color: "var(--verdict-ce)" };
  if (s.includes("internal error"))
    return { cls: "wa", icon: "🔧", color: "var(--verdict-wa)" };
  if (s.includes("compiling"))
    return { cls: "pending", icon: "🔨", color: "var(--verdict-pending)" };
  if (s.includes("running"))
    return { cls: "pending", icon: "▶️", color: "var(--verdict-pending)" };
  if (s.includes("waiting") || s.includes("judging"))
    return { cls: "pending", icon: "⏳", color: "var(--verdict-pending)" };
  return { cls: "pending", icon: "⏳", color: "var(--text-secondary)" };
}

/**
 * Update the verdict panel UI with a poll update.
 */
function renderVerdictUpdate(data) {
  dom.verdictPanel.hidden = false;

  // Progress bar
  if (data.maxPolls && data.poll) {
    const pct = data.terminal ? 100 : Math.min((data.poll / data.maxPolls) * 100, 98);
    dom.verdictProgressBar.style.width = `${pct}%`;
  }

  const statusText = data.status || "Waiting…";
  const meta = getVerdictMeta(statusText);

  // Remove old verdict classes
  dom.verdictStatus.className = "verdict-status";
  dom.verdictStatus.classList.add(`verdict-status--${meta.cls}`);

  dom.verdictStatusIcon.textContent = meta.icon;
  dom.verdictStatusText.textContent = statusText;

  // Progress bar color
  dom.verdictProgressBar.className = "verdict-progress__bar";
  if (data.terminal) {
    dom.verdictProgressBar.classList.add(`verdict-progress__bar--${meta.cls}`);
  }

  // Show details on terminal verdict
  if (data.terminal && data.id) {
    dom.verdictDetails.hidden = false;
    dom.verdictId.textContent = data.id || "—";
    dom.verdictTime.textContent = data.time || "—";
    dom.verdictMem.textContent = data.mem || "—";
    dom.verdictLang.textContent = data.lang || "—";
  }
}

/**
 * Lock/unlock the form during submission.
 */
function setSubmitting(busy) {
  state.isSubmitting = busy;
  dom.submitBtn.disabled = busy;
  dom.problemCode.disabled = busy;
  dom.languageSelect.disabled = busy;
  dom.sourceCode.disabled = busy;
  dom.submitSpinner.hidden = !busy;
  dom.submitBtnText.textContent = busy ? "Submitting…" : "Submit Solution";

  if (!busy) {
    // Re-check if form is valid to re-enable submit
    updateSubmitState();
  }
}

/**
 * Enable/disable the submit button based on form validity.
 */
function updateSubmitState() {
  if (state.isSubmitting) return;
  const valid =
    state.sessionValid &&
    dom.problemCode.value.trim().length > 0 &&
    dom.languageSelect.value !== "" &&
    dom.sourceCode.value.trim().length > 0;
  dom.submitBtn.disabled = !valid;
}

// --- Session Validation ---

async function checkSession() {
  dom.sessionIndicator.className = "session-badge session-badge--loading";
  dom.sessionLabel.textContent = "Checking…";

  try {
    const result = await sendMessage({ action: "VALIDATE_SESSION" });

    if (result.valid) {
      state.sessionValid = true;
      state.username = result.username;
      dom.sessionIndicator.className = "session-badge session-badge--valid";
      dom.sessionLabel.textContent = result.username || "Connected";
    } else {
      state.sessionValid = false;
      state.username = null;
      dom.sessionIndicator.className = "session-badge session-badge--invalid";
      dom.sessionLabel.textContent = "Not logged in";
      showError(result.error || "Please log into SPOJ in a browser tab.");
    }
  } catch (err) {
    state.sessionValid = false;
    dom.sessionIndicator.className = "session-badge session-badge--invalid";
    dom.sessionLabel.textContent = "Error";
    showError(`Session check failed: ${err.message}`);
  }

  updateSubmitState();
}

// --- Language Fetching ---

async function fetchLanguages() {
  const code = dom.problemCode.value.trim().toUpperCase();
  if (!code) {
    dom.languageSelect.innerHTML = '<option value="">Enter problem code first</option>';
    dom.languageSelect.disabled = true;
    updateSubmitState();
    return;
  }

  dom.languageSelect.innerHTML = '<option value="">Loading languages…</option>';
  dom.languageSelect.disabled = true;

  try {
    const result = await sendMessage({ action: "FETCH_LANGUAGES", problemCode: code });

    if (result.error) {
      dom.languageSelect.innerHTML = '<option value="">Failed to load</option>';
      showError(result.error);
      updateSubmitState();
      return;
    }

    // Store hidden fields for submission
    state.hiddenFields = result.hiddenFields || {};

    // Populate select
    dom.languageSelect.innerHTML = "";
    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.textContent = "— Select language —";
    dom.languageSelect.appendChild(defaultOption);

    // Sort: C++ variants first, then rest alphabetically
    const cppLangs = result.languages.filter((l) =>
      l.name.toLowerCase().includes("c++")
    );
    const otherLangs = result.languages.filter(
      (l) => !l.name.toLowerCase().includes("c++")
    );
    cppLangs.sort((a, b) => a.name.localeCompare(b.name));
    otherLangs.sort((a, b) => a.name.localeCompare(b.name));

    // Add C++ group
    if (cppLangs.length > 0) {
      const group = document.createElement("optgroup");
      group.label = "C++ (Recommended)";
      for (const lang of cppLangs) {
        const opt = document.createElement("option");
        opt.value = lang.id;
        opt.textContent = lang.name;
        group.appendChild(opt);
      }
      dom.languageSelect.appendChild(group);
    }

    // Add other languages group
    if (otherLangs.length > 0) {
      const group = document.createElement("optgroup");
      group.label = "Other Languages";
      for (const lang of otherLangs) {
        const opt = document.createElement("option");
        opt.value = lang.id;
        opt.textContent = lang.name;
        group.appendChild(opt);
      }
      dom.languageSelect.appendChild(group);
    }

    dom.languageSelect.disabled = false;

    // Auto-select the first C++17 option, or first C++ option
    const cpp17 = cppLangs.find((l) => l.name.includes("17"));
    const cpp14 = cppLangs.find((l) => l.name.includes("14"));
    const defaultLang = cpp17 || cpp14 || cppLangs[0];
    if (defaultLang) {
      dom.languageSelect.value = defaultLang.id;
    }

    // Persist last used problem code
    chrome.storage.local.set({ lastProblemCode: code });
  } catch (err) {
    dom.languageSelect.innerHTML = '<option value="">Error loading</option>';
    showError(`Language fetch failed: ${err.message}`);
  }

  updateSubmitState();
}

/**
 * Debounced language fetch — triggers 600ms after the user stops typing.
 */
function debouncedFetchLanguages() {
  clearTimeout(state.fetchDebounceTimer);
  state.fetchDebounceTimer = setTimeout(fetchLanguages, 600);
}

// --- Submission Flow ---

async function handleSubmit() {
  if (state.isSubmitting) return;

  const problemCode = dom.problemCode.value.trim().toUpperCase();
  const langId = dom.languageSelect.value;
  const sourceCode = dom.sourceCode.value;

  if (!problemCode || !langId || !sourceCode.trim()) {
    showError("Please fill in all fields.");
    return;
  }

  if (!state.sessionValid) {
    showError("Session is not valid. Please log into SPOJ first.");
    return;
  }

  // If we don't have a username, ask the user
  let username = state.username;
  if (!username) {
    // Try to get it from storage
    const stored = await new Promise((r) =>
      chrome.storage.local.get("spojUsername", (d) => r(d.spojUsername))
    );
    if (stored) {
      username = stored;
    } else {
      showError("Could not determine your SPOJ username. Please re-check your session.");
      return;
    }
  }

  setSubmitting(true);

  // Reset verdict panel
  dom.verdictPanel.hidden = false;
  dom.verdictDetails.hidden = true;
  dom.verdictProgressBar.style.width = "0%";
  dom.verdictProgressBar.className = "verdict-progress__bar";
  dom.verdictStatus.className = "verdict-status verdict-status--pending";
  dom.verdictStatusIcon.textContent = "🚀";
  dom.verdictStatusText.textContent = "Submitting to SPOJ…";

  try {
    // Step 1: Submit
    const submitResult = await sendMessage({
      action: "SUBMIT",
      problemCode,
      langId,
      sourceCode,
      hiddenFields: state.hiddenFields,
    });

    if (!submitResult.success) {
      dom.verdictStatusIcon.textContent = "❌";
      dom.verdictStatusText.textContent = "Submission failed";
      dom.verdictStatus.className = "verdict-status verdict-status--wa";
      showError(submitResult.error || "Submission failed.");
      setSubmitting(false);
      return;
    }

    // Step 2: Poll for verdict
    dom.verdictStatusIcon.textContent = "⏳";
    dom.verdictStatusText.textContent = "Waiting for verdict…";

    const verdictResult = await sendMessage({
      action: "POLL_VERDICT",
      username,
      problemCode,
      interval: 3000,
      maxPolls: 60,
    });

    // Render final verdict
    renderVerdictUpdate({ ...verdictResult, terminal: true });

    if (verdictResult.error) {
      showError(verdictResult.error);
    }
  } catch (err) {
    dom.verdictStatusIcon.textContent = "❌";
    dom.verdictStatusText.textContent = "Error";
    showError(`Submission flow error: ${err.message}`);
  }

  setSubmitting(false);
}

// --- Listen for streaming poll updates from background ---
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "POLL_UPDATE") {
    renderVerdictUpdate(message);
  }
});

// --- Event Listeners ---

// Problem code input — debounced language fetch
dom.problemCode.addEventListener("input", debouncedFetchLanguages);
dom.problemCode.addEventListener("change", fetchLanguages);

// Source code — line numbers
dom.sourceCode.addEventListener("input", () => {
  updateLineNumbers();
  updateSubmitState();
});
dom.sourceCode.addEventListener("scroll", syncScroll);

// Language select change
dom.languageSelect.addEventListener("change", updateSubmitState);

// Submit
dom.submitBtn.addEventListener("click", handleSubmit);

// Keyboard shortcut: Ctrl+Enter to submit
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && !dom.submitBtn.disabled) {
    handleSubmit();
  }
});

// Verdict close button
dom.verdictClose.addEventListener("click", () => {
  dom.verdictPanel.hidden = true;
});

// Tab key support in textarea (insert tab instead of focusing away)
dom.sourceCode.addEventListener("keydown", (e) => {
  if (e.key === "Tab") {
    e.preventDefault();
    const start = dom.sourceCode.selectionStart;
    const end = dom.sourceCode.selectionEnd;
    dom.sourceCode.value =
      dom.sourceCode.value.substring(0, start) +
      "    " +
      dom.sourceCode.value.substring(end);
    dom.sourceCode.selectionStart = dom.sourceCode.selectionEnd = start + 4;
    updateLineNumbers();
  }
});

// --- Initialization ---

(async function init() {
  // Restore last used problem code
  const stored = await new Promise((r) =>
    chrome.storage.local.get(["lastProblemCode", "spojUsername"], (d) => r(d))
  );

  if (stored.lastProblemCode) {
    dom.problemCode.value = stored.lastProblemCode;
  }

  // Check session
  await checkSession();

  // If we have a problem code, fetch languages
  if (dom.problemCode.value.trim()) {
    fetchLanguages();
  }

  // Initialize line numbers
  updateLineNumbers();
})();
