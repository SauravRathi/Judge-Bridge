/**
 * Global error handler middleware.
 * Catches unhandled errors from route handlers and returns a clean JSON response.
 */
function errorHandler(err, _req, res, _next) {
  console.error("[Error]", err.stack || err.message);

  // Mongoose validation error
  if (err.name === "ValidationError") {
    const messages = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({
      success: false,
      error: "Validation error",
      details: messages,
    });
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    return res.status(409).json({
      success: false,
      error: "Duplicate entry",
    });
  }

  // Default to 500
  const status = err.statusCode || 500;
  res.status(status).json({
    success: false,
    error: err.message || "Internal server error",
  });
}

module.exports = errorHandler;
