// ============================================================================
// Problem Model — The Universal Problem Schema
// ============================================================================
// This file defines the SHAPE of a problem document in MongoDB.
//
// WHAT IS A MONGOOSE MODEL?
// Think of it as a blueprint. Just like a class defines what properties
// an object should have, a Mongoose Schema defines what fields a MongoDB
// document should have, what types they are, and what the defaults are.
//
// When you do `Problem.create({...})`, Mongoose validates your data against
// this schema before saving it to MongoDB. This prevents bad data from
// getting into the database.
// ============================================================================

const mongoose = require("mongoose");

// ---------------------------------------------------------------------------
// Schema Definition
// ---------------------------------------------------------------------------

const problemSchema = new mongoose.Schema(
  {
    // === Identity ===
    platform: {
      type: String,
      required: true,
      enum: ["spoj", "uva", "usaco", "codeforces", "atcoder"], // add more as needed
      index: true,
    },
    platformProblemId: {
      type: String,
      required: true, // e.g. "TEST" for SPOJ, "11340" for UVa
    },
    slug: {
      type: String,
      required: true,
      unique: true, // e.g. "spoj-TEST" — globally unique across all platforms
    },
    url: {
      type: String,
      required: true, // Direct link to the original problem page
    },

    // === Content ===
    title: {
      type: String,
      required: true,
    },
    statement: {
      type: String, // Full HTML of the problem statement
      default: "",
    },
    statementPlainText: {
      type: String, // Plain text version (for full-text search)
      default: "",
    },
    inputFormat: {
      type: String, // Separated input specification (if parseable)
      default: "",
    },
    outputFormat: {
      type: String, // Separated output specification (if parseable)
      default: "",
    },
    sampleTests: [
      {
        input: { type: String, default: "" },
        output: { type: String, default: "" },
      },
    ],

    // === Metadata ===
    constraints: {
      timeLimitMs: { type: Number, default: null }, // Time limit in milliseconds
      memoryLimitKB: { type: Number, default: null }, // Memory limit in KB
      sourceLimitBytes: { type: Number, default: null }, // Source code size limit
    },
    tags: {
      type: [String], // ["dp", "graph", "math", ...]
      default: [],
      index: true,
    },
    source: {
      type: String, // Contest/category: "classical", "USACO Dec 2023 Gold"
      default: "",
    },
    author: {
      type: String, // Problem author/setter
      default: null,
    },
    languages: {
      type: [String], // Allowed languages (empty = all allowed)
      default: [],
    },
    category: {
      type: String, // SPOJ: classical / challenge / tutorial / partial / riddle / basics
      default: "",
    },
    numericId: {
      type: Number, // Platform's numeric ID if it has one (SPOJ list ID)
      default: null,
    },
    quality: {
      type: Number, // SPOJ quality score, if present
      default: null,
    },

    // === Difficulty ===
    difficulty: {
      raw: { type: String, default: null }, // Platform's own label (if any)
      solvedCount: { type: Number, default: 0 }, // Users who solved it
      totalSubmissions: { type: Number, default: 0 }, // Total submissions
      acceptRate: { type: Number, default: 0 }, // Acceptance percentage
    },
    normalizedDifficulty: {
      type: Number, // Our unified 1-10 scale (computed later)
      default: null,
      index: true,
    },

    // === Media & extra links (keep these; they are hard to recover later) ===
    images: [
      {
        url: { type: String },
        alt: { type: String, default: "" },
      },
    ],
    resources: [
      {
        title: { type: String, default: "" },
        url: { type: String, default: "" },
      },
    ],

    // === Editorial / solutions ===
    // SPOJ has no official editorial. We store whatever links we find,
    // plus room for editorials we add ourselves later.
    editorial: {
      officialUrl: { type: String, default: null },
      body: { type: String, default: null },
      sources: [
        {
          title: { type: String, default: "" },
          url: { type: String, default: "" },
          kind: { type: String, default: "resource" }, // resource | comment | community | ours
        },
      ],
    },
    relatedProblems: [{ type: String }], // Slugs of related problems
    dateAdded: { type: Date, default: null }, // When added to the platform

    // === Housekeeping ===
    // Keep the untouched HTML. If our parser misses a field, we re-parse
    // this locally instead of hitting SPOJ again.
    rawHtml: {
      type: String,
      default: "",
    },
    scrapedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    // Mongoose options:
    timestamps: true, // Automatically adds createdAt and updatedAt fields
  }
);

// ---------------------------------------------------------------------------
// Indexes — Make database queries fast
// ---------------------------------------------------------------------------
// compound index: quickly find a problem by platform + ID
problemSchema.index({ platform: 1, platformProblemId: 1 }, { unique: true });
// full-text search on title and statement
problemSchema.index({ title: "text", statementPlainText: "text" });
// sort by solved count (for difficulty estimation)
problemSchema.index({ "difficulty.solvedCount": -1 });

// ---------------------------------------------------------------------------
// Static Methods — Reusable query shortcuts
// ---------------------------------------------------------------------------

/**
 * Upsert a problem: insert if it doesn't exist, update if it does.
 * This is the key operation for scrapers — safe to run multiple times
 * without creating duplicates.
 *
 * @param {Object} data - Problem data with at least {platform, platformProblemId}
 * @returns {Promise<Object>} The upserted document
 */
problemSchema.statics.upsertProblem = async function (data) {
  const filter = {
    platform: data.platform,
    platformProblemId: data.platformProblemId,
  };

  if (!data.slug) {
    data.slug = `${data.platform}-${data.platformProblemId}`;
  }

  data.scrapedAt = new Date();

  // Mongo cannot store NaN. Drop those fields instead of failing the whole save.
  stripNaN(data);

  return this.findOneAndUpdate(filter, data, {
    upsert: true,
    new: true,
    setDefaultsOnInsert: true,
  });
};

function stripNaN(obj) {
  if (!obj || typeof obj !== "object") return;
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "number" && Number.isNaN(value)) {
      delete obj[key];
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      stripNaN(value);
    }
  }
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

const Problem = mongoose.model("Problem", problemSchema);
module.exports = Problem;
