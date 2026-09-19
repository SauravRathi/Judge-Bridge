// ============================================================================
// Scraper CLI Runner
// ============================================================================
// This is the "entry point" — the file you run from the terminal.
//
// Usage:
//   node run.js spoj              # Scrape all SPOJ problems
//   node run.js spoj --limit 10   # Scrape only 10 problems (for testing)
//   node run.js spoj --list-only  # Only scrape the problem list (Phase 1)
//   node run.js spoj --details-only  # Only fill in details (Phase 2)
//
// WHAT IS AN ENTRY POINT?
// It's the file that starts your program. When you type `node run.js`,
// Node.js starts executing this file. This file:
// 1. Reads command-line arguments (which platform, what options)
// 2. Connects to MongoDB
// 3. Runs the appropriate scraper
// 4. Disconnects and exits
// ============================================================================

// Load environment variables from .env file
// This reads the MONGODB_URI from .env and makes it available as process.env.MONGODB_URI
require("dotenv").config();

const { connectDB, disconnectDB } = require("./src/db");
const { closeBrowser } = require("./src/utils");
const { scrapeSpoj } = require("./src/platforms/spoj");

// ---------------------------------------------------------------------------
// Parse Command-Line Arguments
// ---------------------------------------------------------------------------

// process.argv is an array of everything after "node":
// ["node", "run.js", "spoj", "--limit", "10"]
//  [0]      [1]       [2]     [3]        [4]
const args = process.argv.slice(2); // Remove "node" and "run.js"
const platform = args[0]; // First arg = platform name

// Parse flags
function hasFlag(flag) {
  return args.includes(flag);
}

function getFlagValue(flag) {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return null;
  return args[idx + 1];
}

const limit = parseInt(getFlagValue("--limit") || "0", 10);
const listOnly = hasFlag("--list-only");
const detailsOnly = hasFlag("--details-only");

// ---------------------------------------------------------------------------
// Supported Scrapers Registry
// ---------------------------------------------------------------------------

// As we add more platforms, we register them here.
// Each entry maps a platform name to its scraper function.
const SCRAPERS = {
  spoj: scrapeSpoj,
  // uva: scrapeUva,     // TODO: Phase 2
  // usaco: scrapeUsaco, // TODO: Phase 3
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // Validate platform argument
  if (!platform) {
    console.log("Usage: node run.js <platform> [options]");
    console.log("");
    console.log("Platforms:");
    console.log("  spoj         Scrape SPOJ classical problems");
    console.log("  uva          Scrape UVa Online Judge (coming soon)");
    console.log("  usaco        Scrape USACO problems (coming soon)");
    console.log("");
    console.log("Options:");
    console.log("  --limit N        Only scrape N problems (for testing)");
    console.log("  --list-only      Only scrape problem lists (Phase 1)");
    console.log("  --details-only   Only fill in problem details (Phase 2)");
    process.exit(0);
  }

  const scraperFn = SCRAPERS[platform.toLowerCase()];
  if (!scraperFn) {
    console.error(`❌ Unknown platform: "${platform}"`);
    console.error(`   Available: ${Object.keys(SCRAPERS).join(", ")}`);
    process.exit(1);
  }

  // Connect to MongoDB
  await connectDB();

  try {
    // Run the scraper
    await scraperFn({ limit, listOnly, detailsOnly });
  } catch (err) {
    console.error("\n❌ Scraper crashed:", err.message);
    console.error(err.stack);
  } finally {
    // Always clean up, even if the scraper crashed
    await closeBrowser();
    await disconnectDB();
  }
}

// Run!
main();
