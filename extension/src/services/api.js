/**
 * API client for the Express backend.
 * Used for submission history storage and retrieval.
 */

const API_BASE = "http://localhost:5000/api";

/**
 * Generic fetch wrapper with error handling.
 */
async function apiFetch(endpoint, opts = {}) {
  const url = `${API_BASE}${endpoint}`;

  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...opts.headers,
    },
    ...opts,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || `API error: HTTP ${response.status}`);
  }

  return data;
}

/**
 * Fetch submission history.
 * @param {string} username
 * @param {Object} filters - { problemCode, verdict, page, limit }
 */
export async function getSubmissions(username, filters = {}) {
  const params = new URLSearchParams({ username, ...filters });
  return apiFetch(`/submissions?${params}`);
}

/**
 * Fetch a single submission by ID.
 * @param {string} id - MongoDB ObjectId
 */
export async function getSubmission(id) {
  return apiFetch(`/submissions/${id}`);
}

/**
 * Save a submission record.
 * @param {Object} submission
 */
export async function saveSubmission(submission) {
  return apiFetch("/submissions", {
    method: "POST",
    body: JSON.stringify(submission),
  });
}

/**
 * Health check for the backend.
 */
export async function healthCheck() {
  try {
    const data = await apiFetch("/health");
    return { online: true, ...data };
  } catch {
    return { online: false };
  }
}
