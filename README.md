# wcaggo-scanner

Backend accessibility scanner for [WCAGgo.com](https://wcaggo.com). Wraps `axe-core` running inside `@sparticuz/chromium` (a memory-optimized Chromium fork) via `puppeteer-core`. Designed to fit within Render free tier limits (512MB RAM).

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

1. Push this repo to GitHub (your existing `wcaggo-scanner` repo).
2. In Render, your existing Web Service should auto-deploy on push.
3. Verify settings:
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Instance Type:** Free
   - **Region:** Frankfurt (or your closest)
4. No Playwright system deps step needed — sparticuz/chromium bundles what it needs.

First build takes 1-2 minutes (down from 5-8 with Playwright).

## Calling it from Lovable

```javascript
const response = await fetch('https://wcaggo-scanner.onrender.com/scan', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ url: userInputUrl }),
});
const report = await response.json();
```

## Free tier reality

- Render free spins down after 15 min idle. First request after sleep: 30-60s cold start. Cover this with a good loading UI on the frontend.
- 512MB RAM means heavy sites (lots of JS, big DOMs) may OOM during scan. If you see scans returning 500 errors with no detail, this is likely. Mitigation: skip image loading, use `domcontentloaded` instead of `networkidle2`. Easy to add later.
- Cold-start memory pressure is now manageable but not free. Watch the Render metrics tab.

## Honest scope

Automated scanning detects roughly 30-40% of WCAG issues — the same coverage as Deque, AccessibilityChecker, Accesseon. Cannot detect:

- Whether alt text is *meaningful*
- Whether focus order is *logical*
- Whether the screen-reader experience is *coherent*
- Most cognitive accessibility issues

Position WCAGgo accordingly. Inflated claims in this category invite FTC scrutiny — accessiBe paid $1M for less.
