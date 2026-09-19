// ============================================================================
// Shared Utilities — Used by all scrapers
// ============================================================================
// These are helper functions that every scraper needs:
// - Fetching web pages via a real browser (Puppeteer)
// - Parsing HTML (with Cheerio)
// - Stripping HTML tags to get plain text
//
// WHY PUPPETEER INSTEAD OF fetch()?
// SPOJ sits behind Cloudflare. Node.js fetch() is blocked immediately.
// Even a hidden (headless) Chrome is often challenged with a "Just a moment..."
// page (Cloudflare Turnstile). We therefore:
//   1. Use the Chrome already installed on this PC
//   2. Keep a persistent profile (.chrome-profile) so cookies survive restarts
//   3. If Cloudflare appears, wait in that same tab — never reload it
// After that first click, Cloudflare sets a cookie (cf_clearance) in the
// profile and later requests usually succeed without another challenge.
// ============================================================================

const path = require("path");
const cheerio = require("cheerio");
const puppeteer = require("puppeteer");

const PROFILE_DIR = path.join(__dirname, "..", ".chrome-profile");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let _browser = null;
let _page = null;

async function getBrowser() {
  if (!_browser || !_browser.connected) {
    console.log("  🌐 Opening Chrome (visible — needed for Cloudflare)...");
    _browser = await puppeteer.launch({
      headless: false,
      channel: "chrome",
      userDataDir: PROFILE_DIR,
      ignoreDefaultArgs: ["--enable-automation"],
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-blink-features=AutomationControlled",
      ],
    });
  }
  return _browser;
}

async function getSharedPage() {
  const browser = await getBrowser();
  if (!_page || _page.isClosed()) {
    _page = await browser.newPage();
  }
  return _page;
}

async function closeBrowser() {
  _page = null;
  if (_browser) {
    await _browser.close();
    _browser = null;
    console.log("  🌐 Browser closed.");
  }
}

/**
 * True only when the REAL SPOJ page is showing.
 * A brief blank/title change is NOT success — treating it as success made
 * the old code call page.goto() again and reset the checkbox.
 */
async function looksLikeRealSpoj(page) {
  try {
    return await page.evaluate(() => {
      const title = (document.title || "").toLowerCase();
      if (title.includes("just a moment")) return false;
      return !!(
        document.querySelector("table.problems") ||
        document.querySelector("#problem-body") ||
        document.querySelector(".prob") ||
        document.querySelector("#content table")
      );
    });
  } catch {
    return false;
  }
}

async function isChallengeShowing(page) {
  try {
    return await page.evaluate(() => {
      const title = (document.title || "").toLowerCase();
      const body = (document.body && document.body.innerText) || "";
      return (
        title.includes("just a moment") ||
        body.includes("Performing security verification") ||
        body.includes("Verify you are human")
      );
    });
  } catch {
    return true;
  }
}

function pathOf(u) {
  try {
    return new URL(u).pathname.replace(/\/+$/, "");
  } catch {
    return u;
  }
}

/** Wait until SPOJ's real DOM appears. Never navigates. */
async function waitForRealSpoj(page, timeoutMs = 300000) {
  console.warn("  🛡️  Cloudflare check is on screen. Complete it in Chrome.");
  console.warn("      I will wait here and will NOT refresh the page.");

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await looksLikeRealSpoj(page)) {
      console.log("  ✅ Cloudflare passed. Continuing.");
      return true;
    }
    await sleep(2000);
  }
  return false;
}

/**
 * Fetch a URL in one shared tab.
 * Navigates at most once per call, and never while the checkbox is visible.
 */
async function fetchWithRetry(url, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 45000;
  const page = await getSharedPage();

  try {
    const alreadyReal = await looksLikeRealSpoj(page);
    const alreadyTarget = pathOf(page.url()) === pathOf(url);
    const challenge = await isChallengeShowing(page);

    if (challenge) {
      // Stay on this tab. Cloudflare will redirect itself after the click.
    } else if (!alreadyTarget) {
      console.log(`  → opening ${url}`);
      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: timeoutMs,
      });
    }

    if (!(await looksLikeRealSpoj(page))) {
      const cleared = await waitForRealSpoj(page);
      if (!cleared) {
        return {
          ok: false,
          status: 403,
          text: "",
          url: page.url(),
          error: "cloudflare_challenge",
        };
      }
    }

    const text = await page.content();
    return {
      ok: await looksLikeRealSpoj(page),
      status: 200,
      text,
      url: page.url(),
    };
  } catch (err) {
    return { ok: false, status: 0, text: "", url, error: err.message };
  }
}

function parseHtml(html) {
  return cheerio.load(html);
}

function stripHtml(html) {
  if (!html) return "";
  const $ = cheerio.load(html);
  return $.text().replace(/\s+/g, " ").trim();
}

function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes > 0) return `${minutes}m ${remainingSeconds}s`;
  return `${remainingSeconds}s`;
}

module.exports = {
  sleep,
  fetchWithRetry,
  closeBrowser,
  parseHtml,
  stripHtml,
  formatDuration,
};
