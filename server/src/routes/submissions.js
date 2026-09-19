const express = require("express");
const Submission = require("../models/Submission");

const router = express.Router();

/**
 * POST /api/submissions
 * Record a new submission after verdict is received.
 *
 * Body: {
 *   submissionId, problemCode, language, languageId,
 *   sourceCode, verdict, time, memory, username
 * }
 */
router.post("/", async (req, res, next) => {
  try {
    const {
      submissionId,
      problemCode,
      language,
      languageId,
      sourceCode,
      verdict,
      time,
      memory,
      username,
    } = req.body;

    // Validate required fields
    if (!problemCode || !sourceCode || !username) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: problemCode, sourceCode, username",
      });
    }

    const submission = await Submission.create({
      submissionId: submissionId || null,
      problemCode: problemCode.toUpperCase().trim(),
      language: language || "Unknown",
      languageId: languageId || null,
      sourceCode,
      verdict: verdict || "pending",
      time: time || "-",
      memory: memory || "-",
      username: username.trim(),
    });

    res.status(201).json({
      success: true,
      data: submission,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/submissions
 * List submission history with pagination and filtering.
 *
 * Query params:
 *   - username (required)
 *   - problemCode (optional)
 *   - verdict (optional)
 *   - page (default: 1)
 *   - limit (default: 20, max: 100)
 */
router.get("/", async (req, res, next) => {
  try {
    const {
      username,
      problemCode,
      verdict,
      page = 1,
      limit = 20,
    } = req.query;

    if (!username) {
      return res.status(400).json({
        success: false,
        error: "Query parameter 'username' is required.",
      });
    }

    // Build filter
    const filter = { username };
    if (problemCode) filter.problemCode = problemCode.toUpperCase().trim();
    if (verdict) filter.verdict = { $regex: verdict, $options: "i" };

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const [submissions, total] = await Promise.all([
      Submission.find(filter)
        .sort({ submittedAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .select("-sourceCode") // Exclude source code from list view for performance
        .lean(),
      Submission.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: submissions,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/submissions/:id
 * Get a single submission by MongoDB _id (includes source code).
 */
router.get("/:id", async (req, res, next) => {
  try {
    const submission = await Submission.findById(req.params.id).lean();

    if (!submission) {
      return res.status(404).json({
        success: false,
        error: "Submission not found.",
      });
    }

    res.json({
      success: true,
      data: submission,
    });
  } catch (err) {
    // Handle invalid ObjectId format
    if (err.kind === "ObjectId") {
      return res.status(404).json({
        success: false,
        error: "Submission not found.",
      });
    }
    next(err);
  }
});

module.exports = router;
