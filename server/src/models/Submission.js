const mongoose = require("mongoose");

const submissionSchema = new mongoose.Schema(
  {
    // SPOJ submission ID (from the status page)
    submissionId: {
      type: String,
      index: true,
    },

    // Problem identification
    problemCode: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      index: true,
    },

    // Language details
    language: {
      type: String,
      default: "Unknown",
    },
    languageId: {
      type: String,
    },

    // The submitted source code
    sourceCode: {
      type: String,
      required: true,
    },

    // Verdict & performance
    verdict: {
      type: String,
      default: "pending",
      index: true,
    },
    time: {
      type: String,
      default: "-",
    },
    memory: {
      type: String,
      default: "-",
    },

    // User info (from the SPOJ session, not stored credentials)
    username: {
      type: String,
      required: true,
      index: true,
    },

    // Timestamp of when the submission was dispatched
    submittedAt: {
      type: Date,
      default: Date.now,
    },

    // Target judge (for future multi-judge support)
    judge: {
      type: String,
      default: "spoj",
      enum: ["spoj", "usaco", "timus"],
    },
  },
  {
    timestamps: true, // adds createdAt and updatedAt
  }
);

// Compound index for efficient queries
submissionSchema.index({ username: 1, submittedAt: -1 });
submissionSchema.index({ username: 1, problemCode: 1, submittedAt: -1 });

const Submission = mongoose.model("Submission", submissionSchema);

module.exports = Submission;
