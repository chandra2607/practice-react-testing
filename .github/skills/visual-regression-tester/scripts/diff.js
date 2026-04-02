#!/usr/bin/env node
// scripts/diff.js
// Runs pixel-level comparison between old and new screenshots using pixelmatch.
// Generates diff images and composite side-by-side views.

const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');
const pixelmatchModule = require('pixelmatch');
const sharp = require('sharp');
const { program } = require('commander');
const cliProgress = require('cli-progress');
const pLimitModule = require('p-limit');

const pixelmatch = pixelmatchModule.default ?? pixelmatchModule;
const pLimit = pLimitModule.default ?? pLimitModule;

program
  .option('--config <file>', 'Path to vrt.config.json', 'vrt.config.json')
  .option('--retry-failed', 'Only re-diff previously failed pages')
  .parse();

const opts = program.opts();

const config = JSON.parse(fs.readFileSync(opts.config, 'utf-8'));
const {
  outputDir = './vrt-results',
  threshold = 0.1,       // pixelmatch per-pixel threshold (0–1, lower = stricter)
  failThreshold = 0.1,   // % of total pixels that triggers FAIL status
  concurrency = 8,
} = config;

const screenshotsDir = path.join(outputDir, 'screenshots');
const diffsDir = path.join(outputDir, 'diffs');
const manifestPath = path.join(outputDir, 'capture-manifest.json');
const diffResultsPath = path.join(outputDir, 'diff-results.json');

fs.mkdirSync(diffsDir, { recursive: true });

// ─── Load manifest ────────────────────────────────────────────────────────────
if (!fs.existsSync(manifestPath)) {
  console.error('❌ capture-manifest.json not found. Run capture.js first.');
  process.exit(1);
}
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

let entries = Object.values(manifest);

// Retry-failed mode
if (opts.retryFailed && fs.existsSync(diffResultsPath)) {
  const existing = JSON.parse(fs.readFileSync(diffResultsPath, 'utf-8'));
  const failedKeys = new Set(
    existing
      .filter(r => r.status === 'fail' || r.status === 'error')
      .map(r => `${r.slug}__${r.breakpoint || 'default'}`)
  );
  entries = entries.filter(e => failedKeys.has(`${e.slug}__${e.breakpoint || 'default'}`));
}

console.log(`\n🔬 Pixel Diff Analysis`);
console.log(`   Captures to diff : ${entries.length}`);
console.log(`   Fail threshold: >${failThreshold}% pixel difference\n`);

// ─── Load / parse a PNG file ──────────────────────────────────────────────────
async function loadPng(filePath) {
  const buffer = fs.readFileSync(filePath);
  return new Promise((resolve, reject) => {
    const png = new PNG();
    png.parse(buffer, (err, data) => {
      if (err) reject(err);
      else resolve(data);
    });
  });
}

// ─── Resize an image to target dimensions ────────────────────────────────────
async function resizePng(png, targetWidth, targetHeight) {
  if (png.width === targetWidth && png.height === targetHeight) return png;
  const buffer = await sharp(PNG.sync.write(png))
    .resize(targetWidth, targetHeight, { fit: 'contain', background: '#ffffff' })
    .png()
    .toBuffer();
  return new Promise((resolve, reject) => {
    const resized = new PNG();
    resized.parse(buffer, (err, data) => {
      if (err) reject(err);
      else resolve(data);
    });
  });
}

// ─── Create composite image: old | diff | new ───────────────────────────────
async function createComposite(oldPng, diffPng, newPng, outputPath) {
  const w = oldPng.width;
  const h = oldPng.height;
  const gap = 4; // pixels between panels
  const totalWidth = w * 3 + gap * 2;

  // Add label bar height
  const labelHeight = 28;
  const totalHeight = h + labelHeight;

  const oldBuffer = PNG.sync.write(oldPng);
  const diffBuffer = PNG.sync.write(diffPng);
  const newBuffer = PNG.sync.write(newPng);

  // Build composite using sharp
  const base = sharp({
    create: {
      width: totalWidth,
      height: totalHeight,
      channels: 4,
      background: { r: 30, g: 30, b: 30, alpha: 1 },
    },
  });

  await base
    .composite([
      // Labels background
      {
        input: Buffer.from(
          `<svg width="${totalWidth}" height="${labelHeight}">
            <rect width="${totalWidth}" height="${labelHeight}" fill="#1e1e1e"/>
            <text x="${w / 2}" y="19" text-anchor="middle" font-family="monospace" font-size="12" fill="#888">OLD</text>
            <text x="${w + gap + w / 2}" y="19" text-anchor="middle" font-family="monospace" font-size="12" fill="#e05f5f">DIFF</text>
            <text x="${w * 2 + gap * 2 + w / 2}" y="19" text-anchor="middle" font-family="monospace" font-size="12" fill="#5fae5f">NEW</text>
          </svg>`
        ),
        top: 0,
        left: 0,
      },
      // Old screenshot
      { input: oldBuffer, top: labelHeight, left: 0 },
      // Diff image
      { input: diffBuffer, top: labelHeight, left: w + gap },
      // New screenshot
      { input: newBuffer, top: labelHeight, left: w * 2 + gap * 2 },
    ])
    .png()
    .toFile(outputPath);
}

// ─── Process a single page ────────────────────────────────────────────────────
async function diffPage(entry) {
  const { slug, newUrl, oldUrl, breakpoint, breakpointLabel, breakpointWidth, breakpointHeight } = entry;
  const breakpointDir = breakpoint || 'default';

  if (entry.status !== 'success') {
    const errorMessages = Object.entries(entry.errors || {})
      .map(([side, message]) => `${side}: ${message}`)
      .join('\n');

    return {
      slug,
      breakpoint: breakpointDir,
      breakpointLabel: breakpointLabel || breakpointDir,
      breakpointWidth,
      breakpointHeight,
      newUrl,
      oldUrl,
      status: 'error',
      error: errorMessages || 'Capture failed',
      diffPercent: null,
    };
  }

  const newPath = path.join(screenshotsDir, slug, breakpointDir, 'new.png');
  const oldPath = path.join(screenshotsDir, slug, breakpointDir, 'old.png');

  if (!fs.existsSync(newPath) || !fs.existsSync(oldPath)) {
    return {
      slug, breakpoint: breakpointDir, breakpointLabel: breakpointLabel || breakpointDir, breakpointWidth, breakpointHeight, newUrl, oldUrl,
      status: 'error',
      error: 'Screenshot file missing',
      diffPercent: null,
    };
  }

  try {
    let [imgNew, imgOld] = await Promise.all([loadPng(newPath), loadPng(oldPath)]);

    // Normalize to same dimensions
    const targetW = Math.max(imgNew.width, imgOld.width);
    const targetH = Math.max(imgNew.height, imgOld.height);
    [imgNew, imgOld] = await Promise.all([
      resizePng(imgNew, targetW, targetH),
      resizePng(imgOld, targetW, targetH),
    ]);

    const diffPng = new PNG({ width: targetW, height: targetH });
    const diffPixels = pixelmatch(
      imgOld.data, imgNew.data, diffPng.data,
      targetW, targetH,
      { threshold, includeAA: false, diffColor: [224, 64, 64], alpha: 0.15 }
    );

    const totalPixels = targetW * targetH;
    const diffPercent = parseFloat(((diffPixels / totalPixels) * 100).toFixed(4));
    const status = diffPercent > failThreshold ? 'fail' : 'pass';

    // Save diff image
    const slugDiffDir = path.join(diffsDir, slug, breakpointDir);
    fs.mkdirSync(slugDiffDir, { recursive: true });
    const diffPath = path.join(slugDiffDir, 'diff.png');
    const compositePath = path.join(slugDiffDir, 'composite.png');

    fs.writeFileSync(diffPath, PNG.sync.write(diffPng));
    await createComposite(imgOld, diffPng, imgNew, compositePath);

    return {
      slug, breakpoint: breakpointDir, breakpointLabel: breakpointLabel || breakpointDir, breakpointWidth, breakpointHeight, newUrl, oldUrl,
      status,
      totalPixels,
      diffPixels,
      diffPercent,
      dimensions: `${targetW}×${targetH}`,
      diffImage: `diffs/${slug}/${breakpointDir}/diff.png`,
      compositeImage: `diffs/${slug}/${breakpointDir}/composite.png`,
      newScreenshot: `screenshots/${slug}/${breakpointDir}/new.png`,
      oldScreenshot: `screenshots/${slug}/${breakpointDir}/old.png`,
    };
  } catch (err) {
    return {
      slug, breakpoint: breakpointDir, breakpointLabel: breakpointLabel || breakpointDir, breakpointWidth, breakpointHeight, newUrl, oldUrl,
      status: 'error',
      error: err.message,
      diffPercent: null,
    };
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const limit = pLimit(concurrency);
  const bar = new cliProgress.SingleBar({
    format: '  {bar} {percentage}% | {value}/{total} | {status}',
    barCompleteChar: '█',
    barIncompleteChar: '░',
    hideCursor: true,
  }, cliProgress.Presets.shades_classic);

  bar.start(entries.length, 0, { status: 'processing...' });
  let completed = 0;

  // Load existing results for merge
  let existingResults = [];
  if (opts.retryFailed && fs.existsSync(diffResultsPath)) {
    existingResults = JSON.parse(fs.readFileSync(diffResultsPath, 'utf-8'));
  }
  const resultMap = Object.fromEntries(existingResults.map(r => [`${r.slug}__${r.breakpoint || 'default'}`, r]));

  if (entries.length === 0) {
    fs.writeFileSync(diffResultsPath, JSON.stringify(Object.values(resultMap), null, 2));
  }

  const tasks = entries.map(entry =>
    limit(async () => {
      const result = await diffPage(entry);
      resultMap[`${result.slug}__${result.breakpoint || 'default'}`] = result;
      completed++;
      const icon = result.status === 'pass' ? '✓' : result.status === 'fail' ? '✗' : '⚠';
      bar.update(completed, { status: `${icon} ${result.slug} ${result.breakpointLabel || ''} (${result.diffPercent ?? '?'}%)` });

      // Incremental write
      fs.writeFileSync(diffResultsPath, JSON.stringify(Object.values(resultMap), null, 2));
    })
  );

  await Promise.all(tasks);
  bar.stop();

  const results = Object.values(resultMap);
  const passed = results.filter(r => r.status === 'pass').length;
  const failed = results.filter(r => r.status === 'fail').length;
  const errors = results.filter(r => r.status === 'error').length;
  const avgDiff = results
    .filter(r => r.diffPercent !== null)
    .reduce((sum, r) => sum + r.diffPercent, 0) / (results.length - errors || 1);

  console.log(`\n✅ Diff complete`);
  console.log(`   Pass    : ${passed}`);
  console.log(`   Fail    : ${failed}`);
  console.log(`   Errors  : ${errors}`);
  console.log(`   Avg diff: ${avgDiff.toFixed(4)}%`);
  console.log(`\n📁 Diff images: ${diffsDir}`);
  console.log(`📋 Results: ${diffResultsPath}`);
}

main().catch(err => {
  console.error('Fatal error in diff:', err);
  process.exit(1);
});