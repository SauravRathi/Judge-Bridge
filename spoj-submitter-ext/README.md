# SPOJ Submitter — Chrome Extension (Manifest V3)

A lightweight **proxy submission client** for [SPOJ (Sphere Online Judge)](https://www.spoj.com) that leverages your active browser session to submit solutions and retrieve verdicts — without storing any credentials.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Chrome Browser                                                 │
│  ┌────────────────────────┐    ┌─────────────────────────────┐  │
│  │  SPOJ Tab (logged in)  │    │  Extension Popup (popup.js) │  │
│  │  ─ Sets session cookies│    │  ─ Problem code input       │  │
│  └────────────────────────┘    │  ─ Language selector         │  │
│            │                   │  ─ Source code editor        │  │
│     cookies stored in          │  ─ Live verdict display      │  │
│     browser cookie jar         └──────────┬──────────────────┘  │
│            │                              │ chrome.runtime       │
│            ▼                              │ messaging            │
│  ┌─────────────────────────────────────────┴──────────────────┐  │
│  │  Background Service Worker (background.js)                 │  │
│  │  ─ chrome.cookies.getAll() → reads SPOJ session            │  │
│  │  ─ GET  /submit/{code}/    → scrape language IDs           │  │
│  │  ─ POST /submit/complete/  → submit solution               │  │
│  │  ─ GET  /status/{code},{user}/ → poll verdict (loop)       │  │
│  └────────────────────────────────────────────────────────────┘  │
│                              │                                   │
│                              │ fetch() with cookies              │
│                              ▼                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  www.spoj.com                                              │  │
│  │  ─ /myaccount/          → session validation               │  │
│  │  ─ /submit/{code}/      → submit form (HTML)               │  │
│  │  ─ /submit/complete/    → submission endpoint (POST)       │  │
│  │  ─ /status/{code},{user}/ → status table (HTML)            │  │
│  └────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Key Endpoints
         
| Method | Endpoint                         | Purpose                            |
|--------|----------------------------------|------------------------------------|
| GET    | `/myaccount/`                    | Session validation (detects login redirect) |
| GET    | `/submit/{problemCode}/`         | Scrape language `<select>` dropdown + hidden fields |
| POST   | `/submit/complete/`              | Submit solution (multipart form data) |
| GET    | `/status/{problemCode},{username}/` | Poll submission status table |

## Security Model (BYOS)

- **Zero credential storage** — The extension never asks for, stores, or transmits your username or password.
- **Session cookies only** — It reads SPOJ cookies from Chrome's cookie jar using the `chrome.cookies` API.
- **Your session, your control** — Log into SPOJ in any browser tab. The extension piggybacks on that session. Log out or clear cookies to revoke access instantly.

---

## Setup Instructions

### Prerequisites
- Google Chrome (or any Chromium-based browser: Edge, Brave, etc.)
- A valid SPOJ account

### Step 1: Load the Extension

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **"Load unpacked"**
4. Select the folder: `d:\CpProject\spoj-submitter-ext\`
5. The extension icon (⚡) should appear in your browser toolbar

### Step 2: Log into SPOJ

1. In a normal browser tab, navigate to [https://www.spoj.com](https://www.spoj.com)
2. Log in with your SPOJ credentials
3. Verify you're logged in (you should see your username in the nav bar)

> **Important:** The extension reads your session cookies. You must be logged in for it to work.

### Step 3: Use the Extension

1. Click the extension icon (⚡) in the toolbar
2. You should see a **green session indicator** with your username
3. Enter a **problem code** (e.g., `TEST`)
4. The **language dropdown** will auto-populate — select your preferred C++ version
5. Paste your source code in the editor
6. Click **Submit Solution** (or press `Ctrl+Enter`)
7. Watch the **live verdict panel** as it polls for results

---

## Test with SPOJ Problem "TEST"

The simplest SPOJ problem to verify with. Here's a correct solution:

```cpp
#include <iostream>
using namespace std;
int main() {
    int n;
    while (cin >> n && n != 42)
        cout << n << endl;
    return 0;
}
```

Expected verdict: **Accepted** ✅

---

## Submission Form Fields

The POST to `/submit/complete/` sends `multipart/form-data` with:

| Field         | Type   | Description                               |
|---------------|--------|-------------------------------------------|
| `problemcode` | text   | Problem code (e.g., `TEST`)               |
| `lang`        | text   | Numeric language ID (scraped dynamically)  |
| `file`        | file   | Source code as a file upload blob          |
| `submit`      | text   | Always `"Submit!"`                        |
| *(hidden)*    | text   | Any CSRF tokens found on the submit page  |

## Verdict Polling

The poller fetches `/status/{code},{username}/` and parses the HTML `<table>` for the latest submission row. It checks:

- **Transient states** (keep polling): `waiting..`, `compiling..`, `running..`, `judging..`
- **Terminal states** (stop polling): `accepted`, `wrong answer`, `time limit exceeded`, `runtime error (*)`, `compilation error`, `memory limit exceeded`

Defaults: **3-second interval**, **60 max polls** (3-minute timeout).

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Red "Not logged in" badge | Log into SPOJ in a browser tab, then reopen the popup |
| "No SPOJ cookies found" | Ensure you're logged into `www.spoj.com` (not `spoj.com` without www) |
| Language dropdown shows "Failed to load" | The problem code may be invalid, or your session expired |
| "Polling timed out" | The submission may still be in queue. Check SPOJ manually |
| Extension icon not visible | Click the puzzle piece icon (🧩) in Chrome toolbar and pin the extension |

---

## File Structure

```
spoj-submitter-ext/
├── manifest.json       # MV3 Chrome Extension manifest
├── background.js       # Service worker: session, submit, poll
├── popup.html          # Extension popup markup
├── popup.js            # Popup controller (UI logic)
├── popup.css           # Dark-theme styles
├── README.md           # This file
└── icons/
    ├── icon16.png      # 16×16 toolbar icon
    ├── icon48.png      # 48×48 extension icon
    └── icon128.png     # 128×128 store icon
```

## License

For personal, educational use only. Respect SPOJ's Terms of Service.
