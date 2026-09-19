// Tiny static server — Node stdlib only (no Puppeteer, no Express).
// Needed so parent + child share an http://localhost origin.
// file:// pages are often treated as unique origins, so window.open DOM access fails.

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 3456;
const ROOT = __dirname;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  const rel = urlPath === "/" ? "/no-puppeteer.html" : urlPath;
  const filePath = path.normalize(path.join(ROOT, rel));

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found: " + rel);
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": TYPES[ext] || "application/octet-stream" });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log("\nNo-Puppeteer lab server running.");
  console.log(`Open: http://localhost:${PORT}/no-puppeteer.html\n`);
  console.log("Then:");
  console.log("  1. Click “Open same-origin child + access it”");
  console.log("  2. Click “Probe / inject into open child”");
  console.log("  3. Click “Open example.com” to see the SecurityError\n");
  console.log("Ctrl+C to stop.\n");
});
