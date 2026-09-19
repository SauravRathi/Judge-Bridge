/**
 * Wrapper around chrome.runtime.sendMessage for communicating
 * with the background service worker.
 *
 * Provides a promise-based API and graceful fallback for
 * development mode (when chrome.runtime is not available).
 */

/**
 * Check if we're running inside a Chrome Extension context.
 */
export function isChromeExtension() {
  return (
    typeof chrome !== "undefined" &&
    typeof chrome.runtime !== "undefined" &&
    typeof chrome.runtime.sendMessage === "function"
  );
}

/**
 * Send a message to the background service worker.
 * @param {Object} message - The message payload (must include an `action` field)
 * @returns {Promise<any>} The response from the service worker
 */
export function sendMessage(message) {
  return new Promise((resolve, reject) => {
    if (!isChromeExtension()) {
      console.warn(
        "[chromeMessaging] Not in extension context. Message:",
        message.action
      );
      reject(new Error("Chrome extension API not available. Open this as a Chrome Extension popup."));
      return;
    }

    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

/**
 * Listen for messages from the background service worker (e.g., POLL_UPDATE).
 * @param {function} handler - Callback for incoming messages
 * @returns {function} Cleanup function to remove the listener
 */
export function onMessage(handler) {
  if (!isChromeExtension()) {
    return () => {}; // no-op cleanup
  }

  chrome.runtime.onMessage.addListener(handler);
  return () => chrome.runtime.onMessage.removeListener(handler);
}

/**
 * Get/set values in chrome.storage.local (or localStorage as fallback).
 */
export const storage = {
  async get(keys) {
    if (isChromeExtension()) {
      return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
    }
    // Fallback for dev mode
    const result = {};
    for (const key of keys) {
      const val = localStorage.getItem(key);
      if (val !== null) {
        try {
          result[key] = JSON.parse(val);
        } catch {
          result[key] = val;
        }
      }
    }
    return result;
  },

  async set(data) {
    if (isChromeExtension()) {
      return new Promise((resolve) => chrome.storage.local.set(data, resolve));
    }
    // Fallback for dev mode
    for (const [key, val] of Object.entries(data)) {
      localStorage.setItem(key, JSON.stringify(val));
    }
  },
};
