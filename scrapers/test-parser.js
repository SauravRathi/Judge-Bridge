// Test the parser + MongoDB path WITHOUT hitting SPOJ.
// This uses a tiny fake HTML page that matches SPOJ's table shape.
require("dotenv").config();

const { connectDB, disconnectDB } = require("./src/db");
const Problem = require("./src/Problem");
const { parseListHtml } = require("./src/platforms/spoj");

const SAMPLE_LIST = `
<table class="problems">
  <tbody>
    <tr>
      <td></td>
      <td>1</td>
      <td><a href="/problems/TEST/">Life, the Universe, and Everything</a></td>
      <td><a href="/problems/TEST/">TEST</a></td>
      <td><a title="Quality 304">****</a></td>
      <td>222223</td>
      <td>33.16%</td>
    </tr>
    <tr>
      <td></td>
      <td>2</td>
      <td><a href="/problems/PRIME1/">Prime Generator</a></td>
      <td><a href="/problems/PRIME1/">PRIME1</a></td>
      <td><a title="Quality 630">****</a></td>
      <td>82558</td>
      <td>16.26%</td>
    </tr>
  </tbody>
</table>
`;

(async () => {
  const { problems } = parseListHtml(SAMPLE_LIST);
  console.log("Parsed", problems.length, "problems:");
  console.log(JSON.stringify(problems, null, 2));

  if (problems.length !== 2) {
    console.error("FAIL: expected 2 problems");
    process.exit(1);
  }
  if (problems[0].code !== "TEST" || problems[0].solvedCount !== 222223) {
    console.error("FAIL: TEST row parsed incorrectly");
    process.exit(1);
  }

  await connectDB();
  for (const p of problems) {
    const doc = await Problem.upsertProblem({
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
      statement: p.code === "TEST"
        ? "<p>Your program is to use the brute-force approach in order to find the Answer to Life, the Universe, and Everything.</p><h3>Input</h3><p>Numbers, one per line.</p><h3>Output</h3><p>Echo numbers until 42.</p>"
        : "",
      sampleTests: p.code === "TEST"
        ? [{ input: "1\n2\n88\n42\n99\n", output: "1\n2\n88\n" }]
        : [],
    });
    console.log("Saved", doc.slug, "->", doc._id.toString());
  }

  const count = await Problem.countDocuments({ platform: "spoj" });
  console.log("SPOJ problems in DB:", count);
  await disconnectDB();
  console.log("PASS");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
