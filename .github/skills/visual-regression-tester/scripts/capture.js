#!/usr/bin/env node
// scripts/capture.js
// Captures screenshots of old and new URLs in parallel using Playwright.
// Handles: HTTP Basic Auth, network-idle wait, retries, error recovery.

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { program } = require('commander');
const cliProgress = require('cli-progress');
const pLimitModule = require('p-limit');
const { loadUrlPairs, deduplicateSlugs } = require('./utils/parse-links');

const pLimit = pLimitModule.default ?? pLimitModule;

program
  .option('--input <file>', 'Path to test-links.md', 'test-links.md')
  .option('--new-input <file>', 'Path to new-urls.md')
  .option('--old-input <file>', 'Path to old-urls.md')
  .option('--config <file>', 'Path to vrt.config.json', 'vrt.config.json')
  .option('--retry-failed', 'Only re-capture previously failed/errored pages')
  .parse();

const opts = program.opts();

// ─── Load config ────────────────────────────────────────────────────────────
const config = JSON.parse(fs.readFileSync(opts.config, 'utf-8'));
const {
  auth = {},
  concurrency = 10,
  viewport = { width: 1440, height: 900 },
  breakpoints = [375, 1440],
  fullPageScreenshot = true,
  waitUntil = 'networkidle',
  waitAfterLoad = 1000,      // ms to wait after networkidle (for animations)
  postScrollWait = 1200,
  scrollStep = 400,
  scrollDelay = 150,
  scrollStabilityIterations = 3,
  timeout = 30000,
  outputDir = './vrt-results',
  retryCount = 2,
} = config;

const screenshotsDir = path.join(outputDir, 'screenshots');
const manifestPath = path.join(outputDir, 'capture-manifest.json');

function normalizeBreakpoints(values, fallbackViewport) {
  const source = Array.isArray(values) && values.length > 0 ? values : [fallbackViewport.width || 1440];

  return source.map(value => {
    if (typeof value === 'number') {
      return {
        id: `w${value}`,
        width: value,
        height: fallbackViewport.height || 900,
        label: `${value}px`,
      };
    }

    const width = Number(value.width);
    return {
      id: value.id || `w${width}`,
      width,
      height: Number(value.height || fallbackViewport.height || 900),
      label: value.label || `${width}px`,
    };
  });
}

const captureBreakpoints = normalizeBreakpoints(breakpoints, viewport);

// ─── Popup / style config ────────────────────────────────────────────────────
const {
  popupDismissWait = 2500,   // ms to wait before attempting popup dismissal
  popupSelectors: configPopupSelectors,
} = config;

const DEFAULT_POPUP_SELECTORS = [
  '[class*="popup"] [class*="close"]',
  '[class*="modal"] [class*="close"]',
  '[class*="overlay"] [class*="close"]',
  '[id*="popup"] [class*="close"]',
  '[id*="modal"] [class*="close"]',
  'button[aria-label*="close" i]',
  'button[aria-label*="dismiss" i]',
  'button[aria-label*="no thanks" i]',
  '[role="dialog"] button[aria-label*="close" i]',
  '[role="dialog"] button',
  '.popup-close', '.modal-close', '.close-popup', '.close-modal',
  '.dismiss-popup', '.cookie-close', '.notification-close',
  '[class*="CloseButton"]', '[class*="close-btn"]', '[class*="closeBtn"]',
  '[class*="btn-close"]', '[class*="dismiss"]',
  '[class*="notification"] [class*="close"]',
  '[class*="banner"] [class*="close"]',
];

const popupSelectors = Array.isArray(configPopupSelectors) && configPopupSelectors.length
  ? configPopupSelectors
  : DEFAULT_POPUP_SELECTORS;

fs.mkdirSync(screenshotsDir, { recursive: true });

// ─── Load URL pairs ──────────────────────────────────────────────────────────
let pairs = deduplicateSlugs(loadUrlPairs({
  inputFile: opts.input,
  newFilePath: opts.newInput,
  oldFilePath: opts.oldInput,
}));

// If retry-failed mode, filter to only failed/errored
if (opts.retryFailed && fs.existsSync(manifestPath)) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  const failedSlugs = new Set(
    Object.entries(manifest)
      .filter(([, v]) => v.status !== 'success')
      .map(([slug]) => slug)
  );
  pairs = pairs.filter(p => failedSlugs.has(p.slug));
  console.log(`🔁 Retry mode: ${pairs.length} pages to re-capture`);
}

console.log(`\n📸 Screenshot Capture`);
console.log(`   Pages    : ${pairs.length}`);
console.log(`   Views    : ${captureBreakpoints.map(point => point.label).join(', ')}`);
console.log(`   Captures : ${pairs.length * captureBreakpoints.length}`);
if (opts.newInput && opts.oldInput) {
  console.log(`   New URLs : ${opts.newInput}`);
  console.log(`   Old URLs : ${opts.oldInput}`);
} else {
  console.log(`   Input    : ${opts.input}`);
}
console.log(`   Parallel : ${concurrency} concurrent`);
console.log(`   Auth     : ${auth.username ? `${auth.username}:***` : 'none'}\n`);

// ─── Load existing manifest ───────────────────────────────────────────────────
let manifest = {};
if (opts.retryFailed && fs.existsSync(manifestPath)) {
  manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
}

// ─── Progress bar ────────────────────────────────────────────────────────────
const bar = new cliProgress.SingleBar({
  format: '  {bar} {percentage}% | {value}/{total} pages | ETA: {eta}s | {status}',
  barCompleteChar: '█',
  barIncompleteChar: '░',
  hideCursor: true,
}, cliProgress.Presets.shades_classic);

bar.start(pairs.length * captureBreakpoints.length, 0, { status: 'starting...' });

// ─── Browser pool ────────────────────────────────────────────────────────────
async function waitForPageToSettle(page) {
  await page.waitForLoadState('domcontentloaded', { timeout });
  await page.waitForLoadState('load', { timeout });

  if (waitUntil === 'networkidle') {
    await page.waitForLoadState('networkidle', { timeout });
  }

  if (waitAfterLoad > 0) {
    await page.waitForTimeout(waitAfterLoad);
  }
}

// ─── Disable animations / transitions for consistent screenshots ─────────────
async function normalizePageStyles(page) {
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-play-state: paused !important;
        transition: none !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
      }
      html, body { scroll-behavior: auto !important; }
    `,
  });
  // Pause any playing videos to avoid mid-frame captures
  await page.evaluate(() => {
    document.querySelectorAll('video').forEach(v => {
      try { v.pause(); v.currentTime = 0; } catch (_) {}
    });
  }).catch(() => {});
}

// ─── Hide overlay popups / modals ─────────────────────────────────────────────
// Uses CSS visibility hiding so fixed/sticky overlays don't appear in
// screenshots, but they stay in the DOM to avoid layout shifts.
// NEVER click close buttons or press Escape — those fire JS events that can
// collapse page sections, destroying content we need to capture.
async function dismissPopups(page) {
  // Wait for timed popups to appear (sites that show them after ~10–15 s)
  if (popupDismissWait > 0) {
    await page.waitForTimeout(popupDismissWait);
  }

  // Hide fixed/sticky positioned elements via inline styles.
  // They stay in the DOM so layout doesn't reflow, but become invisible.
  await page.evaluate(() => {
    document.querySelectorAll('*').forEach(el => {
      const style = getComputedStyle(el);
      const pos = style.position;
      if (pos !== 'fixed' && pos !== 'sticky') return;

      const rect = el.getBoundingClientRect();
      // Skip tiny elements (likely not disruptive)
      if (rect.width < 100 || rect.height < 30) return;

      el.style.setProperty('visibility', 'hidden', 'important');
      el.style.setProperty('pointer-events', 'none', 'important');
    });
  }).catch(() => {});

  await page.waitForTimeout(300);

  // Dismiss any browser-native dialog (alert / confirm / prompt)
  page.on('dialog', dialog => { dialog.dismiss().catch(() => {}); });
}

async function scrollToPageEnd(page) {
  const getHeight = async () =>
    page.evaluate(() =>
      Math.max(
        document.body?.scrollHeight || 0,
        document.documentElement?.scrollHeight || 0,
        document.body?.offsetHeight || 0,
        document.documentElement?.offsetHeight || 0,
        document.body?.clientHeight || 0,
        document.documentElement?.clientHeight || 0
      )
    );

  const bottomWait = Math.max(3000, (postScrollWait || 1200) * 2);
  let lastHeight = 0;
  let stableIterations = 0;

  while (stableIterations < scrollStabilityIterations) {
    const currentHeight = await getHeight();

    // Scroll slowly in steps — each step yields back to the browser
    // so IntersectionObserver, lazy loaders, and rendering can fire
    for (let position = 0; position < currentHeight; position += scrollStep) {
      await page.evaluate(y => {
        window.scrollTo(0, y);
        window.dispatchEvent(new Event('scroll'));
      }, position);
      await page.waitForTimeout(scrollDelay);
    }

    // Park at the absolute bottom and wait for dynamic content to load
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
      window.dispatchEvent(new Event('scroll'));
    });
    await page.waitForTimeout(bottomWait);

    const nextHeight = await getHeight();
    const atBottom = await page.evaluate(() =>
      window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 5
    );

    if (atBottom && nextHeight <= lastHeight) {
      stableIterations += 1;
    } else {
      stableIterations = 0;
    }

    lastHeight = nextHeight;
  }

  // ─── Second pass: scroll the full height once more ──────────────────
  const finalHeight = await getHeight();
  for (let position = 0; position < finalHeight; position += scrollStep) {
    await page.evaluate(y => {
      window.scrollTo(0, y);
      window.dispatchEvent(new Event('scroll'));
    }, position);
    await page.waitForTimeout(scrollDelay);
  }
  await page.evaluate(() => {
    window.scrollTo(0, document.body.scrollHeight);
    window.dispatchEvent(new Event('scroll'));
  });
  await page.waitForTimeout(bottomWait);

  // Wait for all images to finish loading
  await page.evaluate(async () => {
    await Promise.allSettled(
      [...document.querySelectorAll('img')].map(img => {
        if (img.complete) return Promise.resolve();
        return new Promise(resolve => {
          img.addEventListener('load', resolve, { once: true });
          img.addEventListener('error', resolve, { once: true });
          setTimeout(resolve, 5000);
        });
      })
    );
    // Force lazy images to eager-load
    document.querySelectorAll('img[loading="lazy"]').forEach(img => {
      img.removeAttribute('loading');
      if (img.dataset.src) img.src = img.dataset.src;
    });
  }).catch(() => {});

  await page.waitForTimeout(500);

  // Scroll back to top
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
}

async function loadEntirePage(page) {
  await waitForPageToSettle(page);
  // NOTE: Do NOT disable animations/transitions here — scroll-triggered
  // CSS animations (fade-in, slide-up) must be allowed to run so that
  // sections become visible. normalizePageStyles is called right before
  // the final screenshot instead.

  // Trigger lazy-loaded content: force-load all data-src / srcset images,
  // iframes with data-src, and background images referenced in data attrs.
  await page.evaluate(() => {
    // Eager-load images with data-* sources
    document.querySelectorAll('img[data-src], img[data-lazy-src], img[data-original]').forEach(img => {
      const src = img.dataset.src || img.dataset.lazySrc || img.dataset.original;
      if (src) img.src = src;
    });
    document.querySelectorAll('img[loading="lazy"]').forEach(img => {
      img.removeAttribute('loading');
    });
    // Iframes with lazy src
    document.querySelectorAll('iframe[data-src]').forEach(iframe => {
      iframe.src = iframe.dataset.src;
    });
    // Trigger resize/scroll events that some frameworks use to load content
    window.dispatchEvent(new Event('resize'));
    window.dispatchEvent(new Event('scroll'));
  }).catch(() => {});

  await page.waitForTimeout(1000);

  // First scroll pass
  await scrollToPageEnd(page);

  if (postScrollWait > 0) {
    await page.waitForTimeout(postScrollWait);
  }

  // Wait for network to settle after lazy-loaded content has been triggered
  try {
    await page.waitForLoadState('networkidle', { timeout: 15000 });
  } catch (_) {}

  // Second scroll pass — catches content that only renders after the first pass
  // (e.g. components that load data on first intersection then render children)
  await scrollToPageEnd(page);
  await page.waitForTimeout(postScrollWait > 0 ? postScrollWait : 1500);

  // Final networkidle after second pass
  try {
    await page.waitForLoadState('networkidle', { timeout: 10000 });
  } catch (_) {}

  // Final wait for any remaining rendering / paint
  await page.waitForTimeout(1000);
}

async function captureUrl(page, url, outputPath, breakpoint) {
  await page.setViewportSize({ width: breakpoint.width, height: breakpoint.height });


  let lastError;
  for (let attempt = 0; attempt <= retryCount; attempt++) {
    try {
      await page.goto(url, { waitUntil, timeout });
      await loadEntirePage(page);
      await dismissPopups(page);  // hide timed overlays after full page load

      // Now that all content is loaded and visible, freeze animations
      // so the screenshot is deterministic (no mid-animation frames).
      await normalizePageStyles(page);
      await page.waitForTimeout(300);

      // Expand the viewport to the full document height so that ALL
      // content is "in the viewport".  Sites that use virtual rendering
      // (e.g. Next.js/React) remove DOM content for off-screen sections,
      // which would produce blank areas in the screenshot.
      const docHeight = await page.evaluate(() =>
        Math.max(
          document.body?.scrollHeight || 0,
          document.documentElement?.scrollHeight || 0,
        )
      );
      await page.setViewportSize({ width: breakpoint.width, height: docHeight });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(500);

      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      // Capture the full document (viewport is already full-height)
      await page.screenshot({ path: outputPath, fullPage: true });

      // Restore original viewport for next capture
      await page.setViewportSize({ width: breakpoint.width, height: breakpoint.height });

      return { success: true };
    } catch (err) {
      lastError = err;
      if (attempt < retryCount) {
        await page.waitForTimeout(1000 * (attempt + 1));
      }
    }
  }
  return { success: false, error: lastError.message };
}

// ─── Main capture loop ────────────────────────────────────────────────────────
async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--disable-blink-features=AutomationControlled',   // avoid bot detection
    ],
  });
  const limit = pLimit(concurrency);
  let completed = 0;
  const totalCaptures = pairs.length * captureBreakpoints.length;
  const errors = [];
  const realUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
  const contextOptions = {
    ignoreHTTPSErrors: true,
    userAgent: realUserAgent,
    ...(auth.username
      ? {
          httpCredentials: {
            username: auth.username,
            password: auth.password || '',
          },
        }
      : {}),
  };

  const tasks = pairs.map(pair =>
    limit(async () => {
      const { newUrl, oldUrl, slug } = pair;

      for (const breakpoint of captureBreakpoints) {
        const captureId = `${slug}__${breakpoint.id}`;
        const slugDir = path.join(screenshotsDir, slug, breakpoint.id);
        const newPath = path.join(slugDir, 'new.png');
        const oldPath = path.join(slugDir, 'old.png');
        const result = {
          id: captureId,
          slug,
          breakpoint: breakpoint.id,
          breakpointLabel: breakpoint.label,
          breakpointWidth: breakpoint.width,
          breakpointHeight: breakpoint.height,
          newUrl,
          oldUrl,
          status: 'success',
          errors: {},
        };

        const [newCtx, oldCtx] = await Promise.all([
          browser.newContext(contextOptions),
          browser.newContext(contextOptions),
        ]);
        const [newPage, oldPage] = await Promise.all([
          newCtx.newPage(),
          oldCtx.newPage(),
        ]);

        const [newResult, oldResult] = await Promise.all([
          captureUrl(newPage, newUrl, newPath, breakpoint),
          captureUrl(oldPage, oldUrl, oldPath, breakpoint),
        ]);

        await Promise.all([newCtx.close(), oldCtx.close()]);

        if (!newResult.success) {
          result.status = 'error';
          result.errors.new = newResult.error;
          errors.push(`${captureId} [new]: ${newResult.error}`);
        }
        if (!oldResult.success) {
          result.status = 'error';
          result.errors.old = oldResult.error;
          errors.push(`${captureId} [old]: ${oldResult.error}`);
        }

        manifest[captureId] = result;
        completed++;
        bar.update(completed, {
          status: result.status === 'error' ? `❌ ${slug} ${breakpoint.label}` : `✓ ${slug} ${breakpoint.label}`,
        });

        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
      }
    })
  );

  await Promise.all(tasks);
  await browser.close();
  bar.stop();

  // ─── Summary ─────────────────────────────────────────────────────────────
  const successCount = Object.values(manifest).filter(v => v.status === 'success').length;
  const errorCount = Object.values(manifest).filter(v => v.status === 'error').length;

  console.log(`\n✅ Capture complete`);
  console.log(`   Success : ${successCount}/${totalCaptures}`);
  console.log(`   Errors  : ${errorCount}/${totalCaptures}`);

  if (errors.length > 0) {
    console.log(`\n⚠️  Failed captures:`);
    errors.forEach(e => console.log(`   • ${e}`));
  }

  console.log(`\n📁 Screenshots saved to: ${screenshotsDir}`);
  console.log(`📋 Manifest: ${manifestPath}`);
}

main().catch(err => {
  console.error('Fatal error in capture:', err);
  process.exit(1);
});