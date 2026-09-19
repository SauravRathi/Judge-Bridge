require("dotenv").config();

const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const connectDB = require("./config/db");
const submissionRoutes = require("./routes/submissions");
const errorHandler = require("./middleware/errorHandler");

const app = express();
const PORT = process.env.PORT || 5000;

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

// CORS — allow requests from the Chrome extension (no fixed origin)
app.use(
  cors({
    origin: true, // reflect the request origin
    credentials: true,
  })
);

// Request logging
app.use(morgan("dev"));

// JSON body parsing
app.use(express.json({ limit: "5mb" })); // source code can be large
app.use(express.urlencoded({ extended: true }));

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// Health check
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Submission CRUD
app.use("/api/submissions", submissionRoutes);

// 404 catch-all
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: "Route not found",
  });
});

// Global error handler (must be last)
app.use(errorHandler);

// ---------------------------------------------------------------------------
// Start Server
// ---------------------------------------------------------------------------

async function start() {
  // Connect to MongoDB
  await connectDB();

  app.listen(PORT, () => {
    console.log(`[Server] Express running on http://localhost:${PORT}`);
    console.log(`[Server] Health check: http://localhost:${PORT}/api/health`);
  });
}

start().catch((err) => {
  console.error("[Server] Failed to start:", err);
  process.exit(1);
});
