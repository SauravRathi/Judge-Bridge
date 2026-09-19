// ============================================================================
// DOM Injection Lab
// ============================================================================
// Goal: see the same idea the Chrome extension uses for SPOJ submit —
// "run my JS inside a real page's DOM" — but locally, with a visible browser.
//
// Puppeteer's page.evaluate(...) ≈ chrome.scripting.executeScript(...)
// Both inject a function into the page and can read values back.
//
// Run from scrapers/:
//   node learn-dom-injection/inject.js
// ============================================================================

const path = require("path");
const puppeteer = require("puppeteer");

const PAGE_URL = "file:///" + path.join(__dirname, "page.html").replace(/\\/g, "/");
const HOLD_MS = 20000; // keep Chrome open so you can look around

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log("\n=== DOM Injection Lab ===\n");
  console.log("1. Chrome will open the local fake judge page.");
  console.log("2. Watch the window: text/colors change when we inject.");
  console.log("3. Optional: press F12 → Elements / Console to inspect.\n");

  const browser = await puppeteer.launch({
    headless: false,
    channel: "chrome",
    defaultViewport: null,
    args: ["--window-size=900,800"],
  });

  const page = await browser.newPage();
  await page.goto(PAGE_URL, { waitUntil: "domcontentloaded" });

  console.log("Page loaded. Waiting 3s so you can see the BEFORE state...");
  await sleep(3000);

  // -------------------------------------------------------------------------
  // Injection 1: change visible UI (proof we are inside the page DOM)
  // -------------------------------------------------------------------------
  console.log("\n→ Injecting: banner + title rewrite...");
  await page.evaluate(() => {
    const banner = document.getElementById("banner");
    const title = document.getElementById("title");
    const status = document.getElementById("status");

    banner.style.display = "block";
    title.textContent = "Fake Judge — INJECTED";
    status.className = "injected";
    status.textContent = "Injection step 1: DOM nodes were rewritten by Node via page.evaluate().";
  });

  await sleep(2000);

  // -------------------------------------------------------------------------
  // Injection 2: fill the form the way the extension fills SPOJ's form
  // -------------------------------------------------------------------------
  console.log("→ Injecting: fill problem / language / source...");
  const fillResult = await page.evaluate((payload) => {
    const problem = document.getElementById("problem");
    const lang = document.getElementById("lang");
    const source = document.getElementById("source");

    if (!problem || !lang || !source) {
      return { ok: false, error: "Missing form fields" };
    }

    problem.value = payload.problemCode;
    lang.value = payload.langId;
    source.value = payload.sourceCode;

    // Return something Node can print — this is "observe the results"
    return {
      ok: true,
      problem: problem.value,
      lang: lang.value,
      sourcePreview: source.value.slice(0, 40),
      hiddenCsrf: document.querySelector('input[name="csrf"]')?.value || null,
    };
  }, {
    problemCode: "PRIME1",
    langId: "116",
    sourceCode: "print('hello from injected script')\n",
  });

  console.log("   Fill result from inside the page:", fillResult);
  await sleep(2000);

  // -------------------------------------------------------------------------
  // Injection 3: submit the form (mirrors extension's form.submit())
  // -------------------------------------------------------------------------
  console.log("→ Injecting: submit the form...");
  const submitResult = await page.evaluate(() => {
    const form = document.getElementById("submit-form");
    if (!form) return { submitted: false, error: "No form" };

    // On SPOJ the extension often does:
    //   HTMLFormElement.prototype.submit.call(form)
    // which performs a real navigation POST and does NOT fire the "submit"
    // event. Here we use requestSubmit() so the page's submit listener runs
    // and updates #status — easier to observe in this lab.
    form.requestSubmit();
    return { submitted: true };
  });

  console.log("   Submit result:", submitResult);

  // Read the status box AFTER the page handler runs
  await sleep(500);
  const finalStatus = await page.evaluate(() => {
    const el = document.getElementById("status");
    return { className: el.className, text: el.textContent };
  });
  console.log("   #status after submit:", finalStatus);

  console.log(`\nBrowser stays open ${HOLD_MS / 1000}s — inspect the page, then it will close.\n`);
  await sleep(HOLD_MS);
  await browser.close();
  console.log("Done.\n");
}

main().catch((err) => {
  console.error("Lab failed:", err);
  process.exit(1);
});
