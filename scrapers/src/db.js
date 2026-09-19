// ============================================================================
// MongoDB Connection — Shared by all scrapers
// ============================================================================
// Connects to your local MongoDB (running in Docker).
// Uses Mongoose, which is an "ODM" (Object-Document Mapper) — it lets you
// define schemas and interact with MongoDB using JavaScript objects instead
// of raw database commands.
// ============================================================================

const mongoose = require("mongoose");

/**
 * Connect to MongoDB.
 * @param {string} [uri] - Override the default connection string
 * @returns {Promise<void>}
 */
async function connectDB(uri) {
  const connectionUri = uri || process.env.MONGODB_URI || "mongodb://localhost:27017/cp-aggregator";

  try {
    await mongoose.connect(connectionUri);
    const { host, port, name } = mongoose.connection;
    console.log(`[DB] ✅ Connected to MongoDB: ${host}:${port}/${name}`);
  } catch (err) {
    console.error("[DB] ❌ Connection failed:", err.message);
    process.exit(1); // Exit — no point running a scraper without a database
  }
}

/**
 * Disconnect from MongoDB gracefully.
 */
async function disconnectDB() {
  await mongoose.disconnect();
  console.log("[DB] Disconnected.");
}

module.exports = { connectDB, disconnectDB };
