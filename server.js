import express from 'express';
import cors from 'cors';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

const app = express();
const PORT = process.env.PORT || 3000;

// Resolve axe-core's bundled minified script. We inject this into the page
// at scan time. (We don't import axe directly — it must run in the browser context.)
const require = createRequire(import.meta.url);
const axePath = require.resolve('axe-core/axe.min.js');
const axeSource = readFileSync(axePath, 'utf8');

// Reuse one browser across requests — much faster than launching per scan.
let browser;
async function getBrowser() {
  if (!browser || !browser.connected) {
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: { width: 1280, height: 800 },
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }
  return browser;
}

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '1mb' }));

app.get('/', (req, res) => {
  res.json({ ok: true, service: 'wcaggo-scanner', version: '0.2.0' });
});

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

  let page;
  try {
    const b = await getBrowser();
    page = await b.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    );

    await page.goto(parsed.toString(), {
      waitUntil: 'domcontentloaded',
      timeout: 25_000,
    });
    // Give the page a moment to render after DOM is ready
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Inject axe-core into the page and run it.
    await page.evaluate(axeSource);
    const results = await page.evaluate(async () => {
      // eslint-disable-next-line no-undef
      return await axe.run(document, {
        runOnly: {
          type: 'tag',
          values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'],
        },
      });
    });

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
          html: (n.html || '').slice(0, 500),
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
  }
});

process.on('SIGTERM', async () => {
  if (browser) await browser.close().catch(() => {});
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`wcaggo-scanner listening on :${PORT}`);
});
