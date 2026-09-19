const mongoose = require("mongoose");

/**
 * Connect to MongoDB with retry logic.
 * Uses the MONGODB_URI from environment variables.
 */
async function connectDB() {
  const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/spoj-submitter";

  try {
    await mongoose.connect(uri);
    console.log(`[MongoDB] Connected to ${mongoose.connection.host}:${mongoose.connection.port}/${mongoose.connection.name}`);
  } catch (err) {
    console.error("[MongoDB] Connection failed:", err.message);
    // Retry after 5 seconds
    console.log("[MongoDB] Retrying in 5 seconds...");
    setTimeout(connectDB, 5000);
  }

  mongoose.connection.on("disconnected", () => {
    console.warn("[MongoDB] Disconnected. Attempting reconnect...");
  });

  mongoose.connection.on("error", (err) => {
    console.error("[MongoDB] Error:", err.message);
  });
}

module.exports = connectDB;
