#!/usr/bin/env node
// scripts/report.js
// Generates the combined summary dashboard and per-page HTML reports.

const fs = require('fs');
const path = require('path');
const { program } = require('commander');

program
  .option('--config <file>', 'Path to vrt.config.json', 'vrt.config.json')
  .parse();

const opts = program.opts();
const config = JSON.parse(fs.readFileSync(opts.config, 'utf-8'));
const { outputDir = './vrt-results', failThreshold = 0.1 } = config;

function normalizeBreakpoints(values) {
  const source = Array.isArray(values) && values.length > 0 ? values : [1440];

  return source.map(value => {
    if (typeof value === 'number') {
      return { id: `w${value}`, label: `${value}px`, width: value };
    }

    const width = Number(value.width);
    return {
      id: value.id || `w${width}`,
      label: value.label || `${width}px`,
      width,
      height: value.height,
    };
  });
}

const configuredBreakpoints = normalizeBreakpoints(config.breakpoints);
const configuredBreakpointIds = new Set(configuredBreakpoints.map(point => point.id));
const configuredBreakpointLabels = new Set(configuredBreakpoints.map(point => point.label));

const diffResultsPath = path.join(outputDir, 'diff-results.json');
if (!fs.existsSync(diffResultsPath)) {
  console.error('❌ diff-results.json not found. Run diff.js first.');
  process.exit(1);
}

const rawResults = JSON.parse(fs.readFileSync(diffResultsPath, 'utf-8'));
const hasConfiguredBreakpointEntries = rawResults.some(result => configuredBreakpointIds.has(result.breakpoint) || configuredBreakpointLabels.has(result.breakpointLabel));
const results = rawResults.filter(result => {
  if (!hasConfiguredBreakpointEntries) return true;
  return configuredBreakpointIds.has(result.breakpoint) || configuredBreakpointLabels.has(result.breakpointLabel);
});
const pagesDir = path.join(outputDir, 'pages');
fs.mkdirSync(pagesDir, { recursive: true });

// ─── Helpers ──────────────────────────────────────────────────────────────────
function relPath(from, to) {
  return path.relative(from, path.join(outputDir, to)).replace(/\\/g, '/');
}

function statusBadge(status, diffPercent) {
  const color = status === 'pass' ? '#2ea043' : status === 'fail' ? '#da3633' : '#6e7681';
  const label = status === 'pass' ? `✓ PASS (${diffPercent}%)` : status === 'fail' ? `✗ FAIL (${diffPercent}%)` : '⚠ ERROR';
  return `<span class="badge" style="background:${color}">${label}</span>`;
}

function diffBar(percent) {
  if (percent === null) return '<div class="diff-bar error-bar"></div>';
  const capped = Math.min(percent, 100);
  const color = percent > failThreshold ? '#da3633' : percent > failThreshold / 2 ? '#e3b341' : '#2ea043';
  return `<div class="diff-bar-wrap"><div class="diff-bar" style="width:${capped}%;background:${color}"></div><span>${percent}%</span></div>`;
}

function getBreakpointOrder(result) {
  const index = configuredBreakpoints.findIndex(point => point.id === result.breakpoint || point.label === result.breakpointLabel);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

// ─── Per-page reports ─────────────────────────────────────────────────────────
function generatePageReport(slug, variants) {
  const pageDir = path.join(pagesDir, slug);
  fs.mkdirSync(pageDir, { recursive: true });
  const outPath = path.join(pageDir, 'index.html');
  const backLink = path.relative(pageDir, path.join(outputDir, 'index.html')).replace(/\\/g, '/');

  // ── Breakpoint summary bar at the top ───────────────────────────────────
  const bpSummaryCards = variants.map(result => {
    const label = result.breakpointLabel || result.breakpoint || 'default';
    const pct = result.diffPercent;
    if (result.status === 'error') {
      return `<div class="bp-card"><div class="bp-label">${label}</div><span class="badge" style="background:#6e7681">⚠ ERROR</span></div>`;
    }
    const color = pct > failThreshold ? '#da3633' : pct > failThreshold / 2 ? '#e3b341' : '#2ea043';
    const badgeColor = result.status === 'pass' ? '#2ea043' : '#da3633';
    const badgeText = result.status === 'pass' ? '✓ PASS' : '✗ FAIL';
    return `<div class="bp-card">
      <div class="bp-label">${label}</div>
      <div class="bp-deviation" style="color:${color}">${pct}%</div>
      <div class="bp-sub">Pixel Deviation</div>
      <div class="bp-stats">${(result.diffPixels || 0).toLocaleString()} / ${(result.totalPixels || 0).toLocaleString()} px</div>
      <span class="badge" style="background:${badgeColor}">${badgeText}</span>
    </div>`;
  }).join('\n');

  const sections = variants.map(result => {
    const oldImg = relPath(pageDir, result.oldScreenshot || '');
    const newImg = relPath(pageDir, result.newScreenshot || '');
    const diffImg = relPath(pageDir, result.diffImage || '');
    const compositeImg = relPath(pageDir, result.compositeImage || '');

    return `<section class="breakpoint-section">
  <div class="section-header">
    <h2>${result.breakpointLabel || result.breakpoint || 'default'}</h2>
    ${statusBadge(result.status, result.diffPercent)}
  </div>

  <div class="meta">
    <div class="meta-item">
      <label>New URL</label>
      <a href="${result.newUrl}" target="_blank">${result.newUrl}</a>
    </div>
    <div class="meta-item">
      <label>Old URL</label>
      <a href="${result.oldUrl}" target="_blank">${result.oldUrl}</a>
    </div>
    ${result.dimensions ? `<div class="meta-item"><label>Dimensions</label><span>${result.dimensions}</span></div>` : ''}
    ${result.breakpointWidth ? `<div class="meta-item"><label>Breakpoint</label><span>${result.breakpointLabel || result.breakpoint || 'default'} (${result.breakpointWidth}×${result.breakpointHeight || '?'})</span></div>` : ''}
    ${result.totalPixels ? `<div class="meta-item"><label>Total Pixels</label><span>${result.totalPixels.toLocaleString()}</span></div>` : ''}
  </div>

  ${result.status !== 'error' ? `
  <div class="stats">
    <div class="stat">
      <div class="value" style="color:${result.diffPercent > failThreshold ? '#da3633' : '#2ea043'}">${result.diffPercent}%</div>
      <div class="label">Pixel Deviation</div>
    </div>
    <div class="stat">
      <div class="value">${(result.diffPixels || 0).toLocaleString()}</div>
      <div class="label">Diff Pixels</div>
    </div>
    <div class="stat">
      <div class="value">${(result.totalPixels || 0).toLocaleString()}</div>
      <div class="label">Total Pixels</div>
    </div>
  </div>

  <div class="composite-section">
    <h3>Side-by-Side Comparison (OLD | DIFF | NEW)</h3>
    <img class="composite-img" src="${compositeImg}" alt="Composite diff" loading="lazy">
  </div>
  ` : `<div class="error-box">❌ Error: ${result.error || 'Unknown error'}</div>`}
</section>`;
  }).join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>VRT: ${slug}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0d1117; color: #c9d1d9; }
  header { padding: 16px 24px; background: #161b22; border-bottom: 1px solid #30363d; display: flex; align-items: center; gap: 16px; }
  header a { color: #58a6ff; text-decoration: none; font-size: 13px; }
  header a:hover { text-decoration: underline; }
  h1 { font-size: 18px; font-weight: 600; flex: 1; }
  .badge { padding: 3px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; color: #fff; }
  /* Breakpoint summary bar */
  .bp-summary-bar { display: flex; gap: 0; border-bottom: 1px solid #30363d; background: #0d1117; }
  .bp-card { flex: 1; padding: 20px 28px; border-right: 1px solid #30363d; display: flex; flex-direction: column; gap: 4px; }
  .bp-card:last-child { border-right: none; }
  .bp-label { font-size: 11px; text-transform: uppercase; color: #8b949e; font-weight: 600; letter-spacing: 1px; }
  .bp-deviation { font-size: 36px; font-weight: 800; line-height: 1.1; }
  .bp-sub { font-size: 11px; color: #8b949e; text-transform: uppercase; }
  .bp-stats { font-size: 12px; color: #6e7681; font-variant-numeric: tabular-nums; margin-bottom: 4px; }
  main { padding: 24px; display: grid; gap: 24px; }
  .breakpoint-section { border: 1px solid #30363d; border-radius: 10px; overflow: hidden; background: #161b22; }
  .section-header { padding: 16px 24px; display: flex; align-items: center; justify-content: space-between; gap: 16px; border-bottom: 1px solid #30363d; }
  .section-header h2 { font-size: 16px; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding: 20px 24px; background: #161b22; border-bottom: 1px solid #30363d; }
  .meta-item label { font-size: 11px; text-transform: uppercase; color: #8b949e; display: block; margin-bottom: 4px; }
  .meta-item a, .meta-item span { font-size: 13px; color: #58a6ff; word-break: break-all; }
  .meta-item span { color: #c9d1d9; }
  .stats { display: flex; gap: 24px; padding: 20px 24px; border-bottom: 1px solid #30363d; }
  .stat { text-align: center; }
  .stat .value { font-size: 28px; font-weight: 700; }
  .stat .label { font-size: 11px; color: #8b949e; text-transform: uppercase; }
  .composite-section { padding: 24px; }
  .composite-section h3 { font-size: 14px; color: #8b949e; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 1px; }
  .composite-img { width: 100%; border: 1px solid #30363d; border-radius: 6px; cursor: zoom-in; }
  .screenshots { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; padding: 0 24px 24px; }
  .screenshot-col h4 { font-size: 12px; color: #8b949e; text-transform: uppercase; margin-bottom: 8px; }
  .screenshot-col img { width: 100%; border: 1px solid #30363d; border-radius: 4px; }
  .error-box { margin: 24px; padding: 16px; background: #1f2937; border: 1px solid #da3633; border-radius: 6px; color: #f97171; font-family: monospace; }
</style>
</head>
<body>
<header>
  <a href="${backLink}">← Back to Summary</a>
  <h1>${slug}</h1>
  <span class="badge" style="background:#1f6feb">${variants.length} breakpoint${variants.length !== 1 ? 's' : ''}</span>
</header>
<div class="bp-summary-bar">
  ${bpSummaryCards}
</div>
<main>
  ${sections}
</main>
</body>
</html>`;

  fs.writeFileSync(outPath, html);
  return `pages/${slug}/index.html`;
}

// ─── Summary dashboard ────────────────────────────────────────────────────────
function generateSummary(results, pageLinks) {
  // ── Group all capture results by slug ──────────────────────────────────────
  const slugGroups = new Map();
  for (const r of results) {
    if (!slugGroups.has(r.slug)) slugGroups.set(r.slug, {});
    slugGroups.get(r.slug)[r.breakpoint || 'default'] = r;
  }

  // Count at the slug level (worst status per slug determines page status)
  let pagePassed = 0, pageFailed = 0, pageErrors = 0;
  for (const bpMap of slugGroups.values()) {
    const statuses = Object.values(bpMap).map(r => r.status);
    if (statuses.includes('error')) pageErrors++;
    else if (statuses.includes('fail')) pageFailed++;
    else pagePassed++;
  }

  // Aggregate deviation stats across all captures for the overview cards
  const validResults = results.filter(r => r.diffPercent !== null);
  const avgDiff = validResults.length
    ? (validResults.reduce((s, r) => s + r.diffPercent, 0) / validResults.length).toFixed(4)
    : 0;

  // Per-breakpoint avg deviation for overview cards
  const bpAvgCards = configuredBreakpoints.map(bp => {
    const bpResults = validResults.filter(r => r.breakpoint === bp.id || r.breakpointLabel === bp.label);
    const avg = bpResults.length
      ? (bpResults.reduce((s, r) => s + r.diffPercent, 0) / bpResults.length).toFixed(4)
      : null;
    const color = avg !== null && avg > failThreshold ? '#da3633' : '#2ea043';
    return `<div class="ov-card"><div class="value" style="color:${color}">${avg !== null ? avg + '%' : '—'}</div><div class="label">Avg ${bp.label} Deviation</div></div>`;
  }).join('\n');

  // CSV export — one row per capture (unchanged schema)
  const csvRows = ['slug,breakpoint,newUrl,oldUrl,status,diffPercent,diffPixels,totalPixels,dimensions']
    .concat(results.map(r =>
      `"${r.slug}","${r.breakpointLabel || r.breakpoint || ''}","${r.newUrl}","${r.oldUrl}","${r.status}","${r.diffPercent ?? ''}","${r.diffPixels ?? ''}","${r.totalPixels ?? ''}","${r.dimensions ?? ''}"`
    ));
  fs.writeFileSync(path.join(outputDir, 'summary.csv'), csvRows.join('\n'));

  // ── Build one table row per slug ───────────────────────────────────────────
  const sortedSlugs = [...slugGroups.entries()].sort(([, aMap], [, bMap]) => {
    const worst = (map) => {
      const statuses = Object.values(map).map(r => r.status);
      if (statuses.includes('error')) return 0;
      if (statuses.includes('fail')) return 1;
      return 2;
    };
    const wDiff = worst(aMap) - worst(bMap);
    if (wDiff !== 0) return wDiff;
    // Within same worst-status, sort by max deviation desc
    const maxDiff = (map) => Math.max(0, ...Object.values(map).map(r => r.diffPercent || 0));
    return maxDiff(bMap) - maxDiff(aMap);
  });

  const rows = sortedSlugs.map(([slug, bpMap]) => {
    const link = pageLinks[slug] || '#';
    const firstResult = Object.values(bpMap)[0];
    const statuses = Object.values(bpMap).map(r => r.status);
    const worstStatus = statuses.includes('error') ? 'error' : statuses.includes('fail') ? 'fail' : 'pass';

    const statusCell = worstStatus === 'pass'
      ? `<td class="s-pass">✓ PASS</td>`
      : worstStatus === 'fail'
      ? `<td class="s-fail">✗ FAIL</td>`
      : `<td class="s-error">⚠ ERROR</td>`;

    // One deviation cell per configured breakpoint
    const bpCells = configuredBreakpoints.map(bp => {
      const r = bpMap[bp.id];
      if (!r) return '<td class="s-missing">—</td>';
      if (r.status === 'error') return '<td class="s-error">⚠ ERR</td>';
      const pct = r.diffPercent;
      const color = pct > failThreshold ? '#da3633' : pct > failThreshold / 2 ? '#e3b341' : '#2ea043';
      return `<td><div class="bar-cell"><div class="bar-fill" style="width:${Math.min(pct * 10, 100)}%;background:${color}"></div><span style="color:${color}">${pct}%</span></div></td>`;
    }).join('\n');

    return `<tr data-status="${worstStatus}">
      <td><a href="${link}">${slug}</a></td>
      <td><a href="${firstResult.newUrl}" target="_blank" class="url-link">${firstResult.newUrl}</a></td>
      <td><a href="${firstResult.oldUrl}" target="_blank" class="url-link">${firstResult.oldUrl}</a></td>
      ${statusCell}
      ${bpCells}
    </tr>`;
  }).join('\n');

  // Dynamic breakpoint column headers
  const bpHeaders = configuredBreakpoints.map((bp, i) =>
    `<th onclick="sortTable(${4 + i})">${bp.label} Deviation ⇅</th>`
  ).join('\n');

  const totalPages = slugGroups.size;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>VRT Summary Report</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0d1117; color: #c9d1d9; }
  header { padding: 20px 32px; background: #161b22; border-bottom: 1px solid #30363d; }
  header h1 { font-size: 22px; font-weight: 700; }
  header p { font-size: 13px; color: #8b949e; margin-top: 4px; }
  .overview { display: grid; grid-template-columns: repeat(${4 + configuredBreakpoints.length}, 1fr); gap: 0; border-bottom: 1px solid #30363d; }
  .ov-card { padding: 20px 24px; text-align: center; border-right: 1px solid #30363d; }
  .ov-card:last-child { border-right: none; }
  .ov-card .value { font-size: 32px; font-weight: 700; }
  .ov-card .label { font-size: 11px; color: #8b949e; text-transform: uppercase; margin-top: 4px; }
  .toolbar { display: flex; gap: 12px; align-items: center; padding: 16px 24px; background: #161b22; border-bottom: 1px solid #30363d; }
  .filter-btn { padding: 5px 14px; border-radius: 6px; border: 1px solid #30363d; background: #21262d; color: #c9d1d9; cursor: pointer; font-size: 13px; }
  .filter-btn.active { background: #1f6feb; border-color: #1f6feb; color: #fff; }
  .filter-btn:hover { background: #30363d; }
  .export-btn { margin-left: auto; padding: 5px 14px; border-radius: 6px; border: 1px solid #30363d; background: #21262d; color: #c9d1d9; cursor: pointer; font-size: 13px; }
  input[type=search] { padding: 5px 12px; border-radius: 6px; border: 1px solid #30363d; background: #0d1117; color: #c9d1d9; font-size: 13px; width: 280px; }
  .table-wrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  thead th { padding: 10px 16px; text-align: left; font-size: 11px; text-transform: uppercase; color: #8b949e; border-bottom: 1px solid #30363d; cursor: pointer; background: #161b22; user-select: none; position: sticky; top: 0; white-space: nowrap; }
  thead th:hover { color: #c9d1d9; }
  tbody tr { border-bottom: 1px solid #21262d; }
  tbody tr:hover { background: #161b22; }
  tbody td { padding: 10px 16px; vertical-align: middle; }
  tbody td a { color: #58a6ff; text-decoration: none; }
  tbody td a:hover { text-decoration: underline; }
  .url-link { font-size: 11px; color: #8b949e; }
  .url-link:hover { color: #58a6ff; }
  .s-pass { color: #2ea043; font-weight: 600; }
  .s-fail { color: #da3633; font-weight: 600; }
  .s-error { color: #e3b341; font-weight: 600; }
  .s-missing { color: #6e7681; }
  .bar-cell { display: flex; align-items: center; gap: 8px; }
  .bar-fill { height: 8px; border-radius: 4px; min-width: 2px; }
  .bar-cell span { font-variant-numeric: tabular-nums; min-width: 60px; font-weight: 600; font-size: 12px; }
  .hidden { display: none !important; }
</style>
</head>
<body>
<header>
  <h1>🔬 Visual Regression Test Report</h1>
  <p>Generated ${new Date().toLocaleString()} · Fail threshold: &gt;${failThreshold}%</p>
</header>

<div class="overview">
  <div class="ov-card"><div class="value">${totalPages}</div><div class="label">Total Pages</div></div>
  <div class="ov-card"><div class="value" style="color:#2ea043">${pagePassed}</div><div class="label">Pages Passed</div></div>
  <div class="ov-card"><div class="value" style="color:#da3633">${pageFailed}</div><div class="label">Pages Failed</div></div>
  <div class="ov-card"><div class="value" style="color:#e3b341">${pageErrors}</div><div class="label">Pages Errored</div></div>
  ${bpAvgCards}
</div>

<div class="toolbar">
  <button class="filter-btn active" onclick="filter('all', this)">All (${totalPages})</button>
  <button class="filter-btn" onclick="filter('fail', this)" style="color:#da3633">Fail (${pageFailed})</button>
  <button class="filter-btn" onclick="filter('pass', this)" style="color:#2ea043">Pass (${pagePassed})</button>
  <button class="filter-btn" onclick="filter('error', this)" style="color:#e3b341">Error (${pageErrors})</button>
  <input type="search" id="search" placeholder="Search slug or URL…" oninput="filterSearch(this.value)">
  <button class="export-btn" onclick="exportCSV()">⬇ Export CSV</button>
</div>

<div class="table-wrap">
<table id="results-table">
  <thead>
    <tr>
      <th onclick="sortTable(0)">Page Slug ⇅</th>
      <th>New URL</th>
      <th>Old URL</th>
      <th onclick="sortTable(3)">Status ⇅</th>
      ${bpHeaders}
    </tr>
  </thead>
  <tbody id="table-body">
    ${rows}
  </tbody>
</table>
</div>

<script>
  const csvData = ${JSON.stringify(csvRows.join('\n'))};
  let currentFilter = 'all';
  let currentSearch = '';

  function filter(status, btn) {
    currentFilter = status;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    applyFilters();
  }

  function filterSearch(val) {
    currentSearch = val.toLowerCase();
    applyFilters();
  }

  function applyFilters() {
    document.querySelectorAll('#table-body tr').forEach(row => {
      const rowStatus = row.dataset.status || '';
      const text = row.textContent.toLowerCase();
      const statusMatch = currentFilter === 'all' || rowStatus === currentFilter;
      const searchMatch = !currentSearch || text.includes(currentSearch);
      row.classList.toggle('hidden', !statusMatch || !searchMatch);
    });
  }

  function sortTable(col) {
    const tbody = document.getElementById('table-body');
    const rows = Array.from(tbody.querySelectorAll('tr'));
    const asc = tbody.dataset.sortCol == col && tbody.dataset.sortDir === 'asc';
    rows.sort((a, b) => {
      const aVal = a.querySelectorAll('td')[col]?.textContent?.trim() || '';
      const bVal = b.querySelectorAll('td')[col]?.textContent?.trim() || '';
      const aNum = parseFloat(aVal); const bNum = parseFloat(bVal);
      if (!isNaN(aNum) && !isNaN(bNum)) return asc ? aNum - bNum : bNum - aNum;
      return asc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    });
    tbody.dataset.sortCol = col;
    tbody.dataset.sortDir = asc ? 'desc' : 'asc';
    rows.forEach(r => tbody.appendChild(r));
  }

  function exportCSV() {
    const blob = new Blob([csvData], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'vrt-summary.csv';
    a.click();
  }
</script>
</body>
</html>`;

  fs.writeFileSync(path.join(outputDir, 'index.html'), html);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
console.log(`\n📊 Generating Reports`);
console.log(`   Pages: ${results.length}\n`);

const groupedResults = new Map();
for (const result of results) {
  if (!groupedResults.has(result.slug)) {
    groupedResults.set(result.slug, []);
  }
  groupedResults.get(result.slug).push(result);
}

const pageLinks = {};
let generated = 0;
for (const [slug, variants] of groupedResults.entries()) {
  variants.sort((left, right) => getBreakpointOrder(left) - getBreakpointOrder(right));
  pageLinks[slug] = generatePageReport(slug, variants);
  generated++;
  process.stdout.write(`\r  Generating page reports: ${generated}/${groupedResults.size}`);
}
console.log('');

generateSummary(results, pageLinks);

const passed = results.filter(r => r.status === 'pass').length;
const failed = results.filter(r => r.status === 'fail').length;
const errors = results.filter(r => r.status === 'error').length;

console.log(`\n✅ Report generated`);
console.log(`   Pass: ${passed} | Fail: ${failed} | Errors: ${errors}`);
console.log(`\n🌐 Open: ${path.join(outputDir, 'index.html')}`);
console.log(`📋 CSV:  ${path.join(outputDir, 'summary.csv')}`);