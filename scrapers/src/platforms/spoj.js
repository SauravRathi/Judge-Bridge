// ============================================================================
// SPOJ Scraper — Collects problems from www.spoj.com
// ============================================================================
//
// HOW IT WORKS (Two Phases):
//
// Phase 1 — "Problem List Scraper"
//   Visits https://www.spoj.com/problems/classical/?start=0
//   This page shows a table of 50 problems. We extract each problem's:
//   CODE, NAME, USERS (solved count), ACC% (acceptance rate)
//   Then we go to ?start=50, ?start=100, etc. until we've seen all problems.
//
// Phase 2 — "Problem Detail Scraper"
//   For each problem code found in Phase 1, visits:
//   https://www.spoj.com/problems/{CODE}/
//   and extracts the full problem statement, sample I/O, constraints, tags.
//
// WHY TWO PHASES?
//   The list page gives us basic metadata quickly (50 problems per page).
//   The detail page gives us full content but requires one request per problem.
//   By separating them, we can:
//   - Run Phase 1 alone to quickly populate the problem list
//   - Run Phase 2 incrementally (only fetch details for new problems)
//
// ============================================================================

const Problem = require("../Problem");
const {
  sleep,
  fetchWithRetry,
  parseHtml,
  stripHtml,
  formatDuration,
} = require("../utils");

const SPOJ_BASE = "https://www.spoj.com";
const PROBLEMS_PER_PAGE = 50; // SPOJ shows 50 problems per page
const DELAY_BETWEEN_REQUESTS_MS = 2500; // 2.5 seconds between requests

// ---------------------------------------------------------------------------
// Phase 1: Scrape the Problem List
// ---------------------------------------------------------------------------

/**
 * Scrape a single page of the SPOJ classical problems list.
 *
 * URL format: https://www.spoj.com/problems/classical/?start=0
 * Each page shows 50 problems in a table.
 *
 * @param {number} start - Pagination offset (0, 50, 100, ...)
 * @returns {Promise<{problems: Object[], hasMore: boolean}>}
 */
/**
 * Parse a SPOJ classical list HTML page into problem summaries.
 * Separated from fetching so we can test parsing with saved HTML.
 * @param {string} html
 * @returns {{problems: Object[], hasMore: boolean}}
 */
function parseListHtml(html) {
  const $ = parseHtml(html);
  const problems = [];

  $("table.problems tbody tr, table tbody tr").each((_i, row) => {
    const cells = $(row).find("td");
    if (cells.length < 4) return;

    const cellTexts = [];
    cells.each((_j, cell) => {
      cellTexts.push($(cell).text().trim());
    });

    let code = null;
    let name = null;
    let problemUrl = null;

    $(row)
      .find("a")
      .each((_j, link) => {
        const href = $(link).attr("href") || "";
        const match = href.match(/\/problems\/([A-Z0-9_]+)\/?$/i);
        if (match && !code) {
          code = match[1].toUpperCase();
          name = $(link).text().trim();
          problemUrl = href.startsWith("http") ? href : `${SPOJ_BASE}${href}`;
        }
      });

    if (!code) return;

    let solvedCount = 0;
    let acceptRate = 0;
    let numericId = null;
    let quality = null;

    for (const text of cellTexts) {
      if (text.includes("%")) {
        const pct = parseFloat(text.replace("%", ""));
        if (!isNaN(pct)) acceptRate = pct;
        continue;
      }
      const num = parseInt(text, 10);
      if (isNaN(num) || num <= 0 || num >= 1000000) continue;
      if (numericId === null && num < 20000 && String(num) === text) {
        numericId = num;
        continue;
      }
      if (num > solvedCount) solvedCount = num;
    }

    const qualityTitle = $(row).find("a[title]").first().attr("title") || "";
    const qualityMatch = qualityTitle.match(/(\d+(?:\.\d+)?)/);
    if (qualityMatch) {
      const parsed = parseFloat(qualityMatch[1]);
      if (!Number.isNaN(parsed)) quality = parsed;
    }

    problems.push({
      code,
      name: name || code,
      url: problemUrl || `${SPOJ_BASE}/problems/${code}/`,
      solvedCount,
      acceptRate,
      numericId,
      quality,
    });
  });

  const hasMore =
    $('a:contains("Next")').length > 0 ||
    $('a[href*="start="]').last().text().toLowerCase().includes("next") ||
    problems.length >= PROBLEMS_PER_PAGE;

  return { problems, hasMore };
}

async function scrapeListPage(start) {
  const url = `${SPOJ_BASE}/problems/classical/?start=${start}`;
  const resp = await fetchWithRetry(url);

  if (!resp.ok) {
    console.error(`  ❌ Failed to fetch list page at start=${start}: HTTP ${resp.status}`);
    return { problems: [], hasMore: false };
  }

  return parseListHtml(resp.text);
}

/**
 * Scrape ALL pages of the SPOJ classical problems list.
 * @param {Object} opts
 * @param {number} opts.limit - Maximum number of problems to scrape (0 = all)
 * @returns {Promise<Object[]>} Array of problem summary objects
 */
async function scrapeAllListPages(opts = {}) {
  const limit = opts.limit || 0;
  let start = 0;
  const allProblems = [];

  console.log("\n📋 Phase 1: Scraping SPOJ problem list...\n");

  while (true) {
    process.stdout.write(`  Fetching page at start=${start}... `);
    const { problems, hasMore } = await scrapeListPage(start);
    console.log(`found ${problems.length} problems`);

    allProblems.push(...problems);

    // Check if we've hit the limit
    if (limit > 0 && allProblems.length >= limit) {
      console.log(`  Reached limit of ${limit} problems.`);
      return allProblems.slice(0, limit);
    }

    if (!hasMore || problems.length === 0) {
      break;
    }

    start += PROBLEMS_PER_PAGE;
    await sleep(DELAY_BETWEEN_REQUESTS_MS);
  }

  console.log(`\n  ✅ Found ${allProblems.length} problems total.\n`);
  return allProblems;
}

// ---------------------------------------------------------------------------
// Phase 2: Scrape Individual Problem Pages
// ---------------------------------------------------------------------------

/**
 * Scrape a single SPOJ problem page for full details.
 *
 * Extracts:
 * - Full problem statement (HTML)
 * - Input/Output format
 * - Sample test cases
 * - Time/Memory/Source limits
 * - Tags (if present)
 *
 * @param {string} code - Problem code (e.g. "TEST")
 * @returns {Promise<Object|null>} Parsed problem details, or null on failure
 */
async function scrapeProblemPage(code) {
  const url = `${SPOJ_BASE}/problems/${code}/`;
  const resp = await fetchWithRetry(url);

  if (!resp.ok) {
    console.warn(`  ⚠️  Failed to fetch problem ${code}: HTTP ${resp.status}`);
    return null;
  }

  const $ = parseHtml(resp.text);

  // --- Extract problem statement ---
  // The main content is usually in #problem-body or .prob div
  let statement = "";
  const probBody =
    $("#problem-body").html() ||
    $(".prob").html() ||
    $(".problem-body").html() ||
    "";
  statement = probBody.trim();

  // Make image URLs absolute so they still work on our site
  const images = [];
  if (statement) {
    const $stmt = parseHtml(statement);
    $stmt("img").each((_i, img) => {
      const src = $stmt(img).attr("src") || "";
      if (!src) return;
      const abs = src.startsWith("http") ? src : `${SPOJ_BASE}${src.startsWith("/") ? "" : "/"}${src}`;
      $stmt(img).attr("src", abs);
      images.push({ url: abs, alt: $stmt(img).attr("alt") || "" });
    });
    statement = $stmt("body").html() || statement;
  }

  // --- Extract input/output format ---
  // SPOJ uses <h3>Input</h3> and <h3>Output</h3> as section headers
  let inputFormat = "";
  let outputFormat = "";

  $("h3").each((_i, heading) => {
    const headingText = $(heading).text().trim().toLowerCase();
    // Get all sibling content until the next <h3>
    const content = [];
    let sibling = $(heading).next();
    while (sibling.length && !sibling.is("h3")) {
      content.push(sibling.toString());
      sibling = sibling.next();
    }
    const sectionHtml = content.join("");

    if (headingText === "input") {
      inputFormat = stripHtml(sectionHtml);
    } else if (headingText === "output") {
      outputFormat = stripHtml(sectionHtml);
    }
  });

  // --- Extract sample test cases ---
  // Usually in <pre> blocks after <h3>Example</h3>
  const sampleTests = [];
  let examplePre = "";

  $("h3").each((_i, heading) => {
    const headingText = $(heading).text().trim().toLowerCase();
    if (headingText.includes("example") || headingText.includes("sample")) {
      // Collect all <pre> blocks after this heading
      let sibling = $(heading).next();
      while (sibling.length && !sibling.is("h3")) {
        if (sibling.is("pre")) {
          examplePre += sibling.text() + "\n===SEPARATOR===\n";
        }
        // Sometimes the pre is nested inside another element
        sibling.find("pre").each((_j, pre) => {
          examplePre += $(pre).text() + "\n===SEPARATOR===\n";
        });
        sibling = sibling.next();
      }
    }
  });

  // Also check for standalone pre blocks if no example section found
  if (!examplePre) {
    $("pre").each((_i, pre) => {
      examplePre += $(pre).text() + "\n===SEPARATOR===\n";
    });
  }

  // Try to parse input/output from the example text
  // SPOJ usually formats examples as:
  //   Input:
  //   1 2 88 42 99
  //
  //   Output:
  //   1 2 88
  if (examplePre) {
    const parts = examplePre.split(/(?:input|output)\s*:?\s*/i).filter(Boolean);
    if (parts.length >= 2) {
      // Pair up input/output
      for (let i = 0; i < parts.length - 1; i += 2) {
        sampleTests.push({
          input: parts[i].replace(/===SEPARATOR===/g, "").trim(),
          output: (parts[i + 1] || "").replace(/===SEPARATOR===/g, "").trim(),
        });
      }
    } else if (parts.length === 1) {
      // Just dump it as a single example
      sampleTests.push({
        input: parts[0].replace(/===SEPARATOR===/g, "").trim(),
        output: "",
      });
    }
  }

  // --- Extract constraints (time limit, memory limit, etc.) ---
  let timeLimitMs = null;
  let memoryLimitKB = null;
  let sourceLimitBytes = null;

  // SPOJ shows these in the problem footer/metadata area
  const fullText = $.text();

  const timeMatch = fullText.match(/time\s*limit[:\s]*([0-9.]+)\s*s/i);
  if (timeMatch) {
    timeLimitMs = Math.round(parseFloat(timeMatch[1]) * 1000);
  }

  const memMatch = fullText.match(/memory\s*limit[:\s]*(\d+)\s*(MB|KB)/i);
  if (memMatch) {
    const val = parseInt(memMatch[1], 10);
    memoryLimitKB = memMatch[2].toUpperCase() === "MB" ? val * 1024 : val;
  }

  const srcMatch = fullText.match(/source\s*limit[:\s]*(\d+)\s*B/i);
  if (srcMatch) {
    sourceLimitBytes = parseInt(srcMatch[1], 10);
  }

  // --- Extract tags ---
  const tags = [];
  $(".problem-tag, .tag, a[href*='/tags/']").each((_i, el) => {
    const tag = $(el).text().trim().toLowerCase();
    if (tag && tag.length > 1 && tag.length < 50) {
      tags.push(tag);
    }
  });

  // --- Extract author ---
  let author = null;
  const authorMatch = fullText.match(/added\s*by[:\s]*([^\n]+)/i);
  if (authorMatch) {
    author = authorMatch[1].trim();
  }

  // --- Extract resource / editorial links ---
  const resources = [];
  $('a[href]').each((_i, el) => {
    const href = ($(el).attr("href") || "").trim();
    const title = $(el).text().trim();
    const lower = `${href} ${title}`.toLowerCase();
    if (
      lower.includes("editorial") ||
      lower.includes("solution") ||
      lower.includes("tutorial") ||
      lower.includes("/forum/") ||
      title.toLowerCase() === "resource" ||
      title.toLowerCase() === "resources"
    ) {
      const abs = href.startsWith("http") ? href : `${SPOJ_BASE}${href.startsWith("/") ? "" : "/"}${href}`;
      resources.push({ title: title || abs, url: abs });
    }
  });

  return {
    rawHtml: resp.text,
    statement,
    statementPlainText: stripHtml(statement),
    inputFormat,
    outputFormat,
    sampleTests,
    constraints: {
      timeLimitMs,
      memoryLimitKB,
      sourceLimitBytes,
    },
    tags,
    author,
    images,
    resources,
    editorial: {
      officialUrl: null,
      body: null,
      sources: resources.map((r) => ({ ...r, kind: "resource" })),
    },
  };
}

// ---------------------------------------------------------------------------
// Main Scraper — Combines Phase 1 + Phase 2
// ---------------------------------------------------------------------------

/**
 * Run the full SPOJ scraper.
 * @param {Object} opts
 * @param {number} opts.limit - Max problems to scrape (0 = all)
 * @param {boolean} opts.listOnly - If true, only run Phase 1 (list pages)
 * @param {boolean} opts.detailsOnly - If true, only run Phase 2 (fill in details for existing records)
 */
async function scrapeSpoj(opts = {}) {
  const startTime = Date.now();

  console.log("=".repeat(60));
  console.log("  🕷️  SPOJ Scraper");
  console.log("=".repeat(60));

  // ------------------------------------------------------------------
  // Phase 1: Get the problem list
  // ------------------------------------------------------------------
  let problemList = [];
  if (!opts.detailsOnly) {
    problemList = await scrapeAllListPages({ limit: opts.limit });

    // Save each problem to MongoDB (Phase 1 data only)
    console.log("💾 Saving problem list to MongoDB...\n");
    let saved = 0;
    for (const p of problemList) {
      try {
        await Problem.upsertProblem({
          platform: "spoj",
          platformProblemId: p.code,
          slug: `spoj-${p.code}`,
          url: p.url,
          title: p.name,
          source: "classical",
          category: "classical",
          numericId: p.numericId,
          quality: p.quality,
          difficulty: {
            solvedCount: p.solvedCount,
            acceptRate: p.acceptRate,
          },
        });
        saved++;
      } catch (err) {
        console.warn(`  ⚠️  Failed to save ${p.code}: ${err.message}`);
      }
    }
    console.log(`  ✅ Saved ${saved} problems to MongoDB.\n`);
  }

  // ------------------------------------------------------------------
  // Phase 2: Fetch full details for each problem
  // ------------------------------------------------------------------
  if (!opts.listOnly) {
    if (!opts.detailsOnly && problemList.length === 0) {
      console.log("⚠️  Phase 1 found 0 problems (likely Cloudflare). Skipping Phase 2 so we don't open more pages.");
      const elapsed = formatDuration(Date.now() - startTime);
      console.log("=".repeat(60));
      console.log(`  🏁 SPOJ scraper finished in ${elapsed}`);
      console.log("=".repeat(60));
      return;
    }

    console.log("\n📖 Phase 2: Scraping individual problem pages...\n");

    // Find problems that don't have full details yet
    const query = { platform: "spoj", statement: { $in: ["", null] } };
    if (opts.limit) {
      // If limit is set, only process that many
    }
    const problemsToScrape = await Problem.find(query)
      .limit(opts.limit || 0)
      .lean();

    console.log(`  Found ${problemsToScrape.length} problems needing details.\n`);

    let scraped = 0;
    let failed = 0;

    for (const problem of problemsToScrape) {
      const code = problem.platformProblemId;
      process.stdout.write(
        `  [${scraped + failed + 1}/${problemsToScrape.length}] Scraping ${code}... `
      );

      const details = await scrapeProblemPage(code);

      if (details) {
        try {
          await Problem.upsertProblem({
            platform: "spoj",
            platformProblemId: code,
            ...details,
          });
          scraped++;
          console.log("✅");
        } catch (err) {
          failed++;
          console.log(`❌ (save error: ${err.message})`);
        }
      } else {
        failed++;
        console.log("❌ (fetch failed)");
      }

      await sleep(DELAY_BETWEEN_REQUESTS_MS);
    }

    console.log(
      `\n  ✅ Phase 2 complete: ${scraped} scraped, ${failed} failed.\n`
    );
  }

  const elapsed = formatDuration(Date.now() - startTime);
  console.log("=".repeat(60));
  console.log(`  🏁 SPOJ scraper finished in ${elapsed}`);
  console.log("=".repeat(60));
}

module.exports = { scrapeSpoj, scrapeProblemPage, scrapeListPage, parseListHtml };
