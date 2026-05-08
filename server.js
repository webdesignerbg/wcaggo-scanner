import express from 'express';
import cors from 'cors';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const app = express();
const PORT = process.env.PORT || 3000;

// Reuse one browser across requests — much faster than launching per scan.
let browser;
async function getBrowser() {
  if (!browser || !browser.isConnected()) {
    browser = await chromium.launch({
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
  }
  return browser;
}

// Allow your Lovable frontend to call this API. Tighten origin in production.
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '1mb' }));

// Health check — used by Render to verify the service is alive.
app.get('/', (req, res) => {
  res.json({ ok: true, service: 'wcaggo-scanner', version: '0.1.0' });
});

// Main scan endpoint.
// POST /scan  { "url": "https://example.com" }
app.post('/scan', async (req, res) => {
  const startedAt = Date.now();
  const { url } = req.body || {};

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid "url" in request body.' });
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return res.status(400).json({ error: 'URL is not parseable.' });
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return res.status(400).json({ error: 'Only http and https URLs are supported.' });
  }

  let context;
  let page;
  try {
    const b = await getBrowser();
    context = await b.newContext({
      userAgent:
        'Mozilla/5.0 (compatible; WCAGgoBot/0.1; +https://wcaggo.com/bot)',
      viewport: { width: 1280, height: 800 },
    });
    page = await context.newPage();

    // 25s navigation budget — fits within Render free tier request limits.
    await page.goto(parsed.toString(), {
      waitUntil: 'networkidle',
      timeout: 25_000,
    });

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();

    const summary = {
      url: results.url,
      scannedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      counts: {
        violations: results.violations.length,
        passes: results.passes.length,
        incomplete: results.incomplete.length,
        inapplicable: results.inapplicable.length,
      },
      violations: results.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        help: v.help,
        helpUrl: v.helpUrl,
        description: v.description,
        wcagTags: v.tags.filter((t) => t.startsWith('wcag')),
        nodeCount: v.nodes.length,
        nodes: v.nodes.slice(0, 10).map((n) => ({
          target: n.target,
          html: n.html.slice(0, 500),
          failureSummary: n.failureSummary,
        })),
      })),
    };

    res.json(summary);
  } catch (err) {
    console.error('Scan failed:', err);
    res.status(500).json({
      error: 'Scan failed.',
      detail: err.message,
      durationMs: Date.now() - startedAt,
    });
  } finally {
    if (page) await page.close().catch(() => {});
    if (context) await context.close().catch(() => {});
  }
});

// Graceful shutdown so Render restart cycles are clean.
process.on('SIGTERM', async () => {
  if (browser) await browser.close().catch(() => {});
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`wcaggo-scanner listening on :${PORT}`);
});
