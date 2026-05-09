# wcaggo-scanner

Backend accessibility scanner for [WCAGgo.com](https://wcaggo.com). Wraps `axe-core` running inside `@sparticuz/chromium` (a memory-optimized Chromium fork) via `puppeteer-core`. Designed to fit within Render free tier limits (512MB RAM).

Copyright (c) 2026 WCAGgo.com.
All rights reserved.

## What it does

`POST /scan` with a URL, get back a JSON report of WCAG 2.0 / 2.1 / 2.2 Level A and AA violations.

## Why this stack (not Playwright)

The first version of this scanner used Playwright + full Chromium and failed to deploy on Render's free tier — Chromium's 600MB extracted footprint OOM-killed the build. This version uses `@sparticuz/chromium`, a Lambda-optimized Chromium fork that ships pre-compressed (~64MB) and runs leaner. Total `node_modules` is ~117MB.

Tradeoff: Sparticuz Chromium tracks upstream Chrome with some lag. For a WCAG scanner this is fine — axe-core is what matters, the browser just renders the page.

## Local setup

```bash
npm install
npm start
```

Server runs on `http://localhost:3000`. First scan downloads/extracts Chromium to a temp directory (~30s); subsequent scans are fast.

## Test it

```bash
curl -X POST http://localhost:3000/scan \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com"}'
```

Try a deliberately broken site for visible violations:

```bash
curl -X POST http://localhost:3000/scan \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.w3.org/WAI/demos/bad/before/home.html"}'
```

## Deploying to Render

1. Push this repo to GitHub.
2. In Render, your Web Service auto-deploys on push.
3. Settings:
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Instance Type:** Free
   - **Region:** Frankfurt (or your closest)

First build takes ~1 minute. Subsequent deploys are faster thanks to Render's build cache.

## Calling it from Lovable

```javascript
const response = await fetch('https://wcaggo-scanner.onrender.com/scan', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ url: userInputUrl }),
});
const report = await response.json();
```

## Free tier reality (tested with real sites)

What works well:
- Personal portfolios, wedding sites, small business sites — clean scans in 5-20s
- Mid-size content sites (Wikipedia, GOV.UK) — clean scans in 15-25s
- Heavier marketing pages with embeds and ads — scans in 30-50s

Known limits:
- Render free spins down after 15 min idle. First request after sleep: 30-60s cold start. Cover with a good loading UI on the frontend.
- Heavy news sites (CNN, NYT-style homepages) OOM at 512MB RAM. The container restarts cleanly; users get a generic timeout error.
- Sites with sophisticated bot detection (Amazon, etc.) may serve stripped-down pages and return false-clean results. Disclose this limitation to users.

## Implementation notes

- Browser instance is reused across requests (single Chromium process across all scans) for speed.
- Page wait strategy: `domcontentloaded` + 2s buffer, not `networkidle2`. Modern ad-funded sites never reach `networkidle2` because of constant analytics/ad pings.
- User-Agent identifies as Chrome 131 on Windows 10 to avoid being filtered by sites that block obvious bots.
- Navigation timeout: 25s. Tune higher if you upgrade off free tier.

## Honest scope

Automated scanning detects roughly 30-40% of WCAG issues — the same coverage as Deque, AccessibilityChecker, Accesseon. Cannot detect:

- Whether alt text is *meaningful*
- Whether focus order is *logical*
- Whether the screen-reader experience is *coherent*
- Most cognitive accessibility issues