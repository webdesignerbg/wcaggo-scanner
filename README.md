# wcaggo-scanner

Backend accessibility scanner for [WCAGgo.com](https://wcaggo.com). Wraps `axe-core` running inside a real headless Chromium browser via Playwright. Exposed as a small Express HTTP API.

## What it does

`POST /scan` with a URL, get back a JSON report of WCAG 2.0 / 2.1 / 2.2 Level A and AA violations.

This catches roughly 30–40% of WCAG issues automatically — the same coverage as Deque, AccessibilityChecker, Accesseon, and every other axe-core-based scanner. Manual review is needed for the rest.

## Local setup

```bash
npm install
npx playwright install chromium
npm start
```

Server runs on `http://localhost:3000`.

## Test it

```bash
curl -X POST http://localhost:3000/scan \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com"}'
```

You'll get back JSON like:

```json
{
  "url": "https://example.com/",
  "scannedAt": "2026-05-08T...",
  "durationMs": 2847,
  "counts": { "violations": 0, "passes": 14, "incomplete": 0, "inapplicable": 47 },
  "violations": []
}
```

Try a site with real issues:

```bash
curl -X POST http://localhost:3000/scan \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.w3.org/WAI/demos/bad/before/home.html"}'
```

## Deploying to Render

1. Push this repo to GitHub.
2. In Render, click **New → Web Service** and connect the repo.
3. Configure:
   - **Runtime:** Node
   - **Build Command:** `npm install && npx playwright install chromium`
   - **Start Command:** `node server.js`
   - **Instance Type:** Free (or Starter if you want no cold starts)
   - **Region:** Whatever's closest to your users
4. Click **Create Web Service**.

First build takes 5–8 minutes (Chromium is a heavy install). Subsequent deploys are faster.

Your scanner will be live at `https://your-service-name.onrender.com`.

## Calling it from Lovable

In your Lovable frontend, call:

```javascript
const response = await fetch('https://your-service-name.onrender.com/scan', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ url: userInputUrl }),
});
const report = await response.json();
```

## Notes on free tier

Render free tier spins down after 15 minutes of inactivity. The first request after a sleep takes 30–60 seconds to cold-start before the actual scan runs. Show a clear loading UI on the frontend (staged progress, streaming pseudo-logs) so users have something to look at. See `WCAGgo`'s frontend repo for how that's wired up.

To eliminate cold starts entirely, upgrade to Render Starter ($7/mo) or Railway Hobby ($5/mo).

## Limits worth knowing

- Single-page only (no crawling yet).
- 25-second navigation timeout per scan — sites that are slow to reach `networkidle` will time out.
- No support for sites behind login (would need cookie / auth handling).
- Returns at most 10 example DOM nodes per violation (full count is in `nodeCount`).

## Honest scope

Automated scanners cannot detect:
- Whether alt text is *meaningful* (only whether it exists)
- Whether focus order is *logical* (only whether elements are focusable)
- Whether the screen-reader experience is *coherent*
- Most cognitive accessibility issues

Position WCAGgo accordingly. Inflated claims in this category attract FTC scrutiny — accessiBe paid $1M for less.
