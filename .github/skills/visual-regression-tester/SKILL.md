---
name: visual-regression-tester
description: >
  Full-scale Visual Regression Testing (VRT) skill for comparing screenshots of old vs
  new URLs in parallel — designed for large batches of 50–500 pages. Use this skill
  whenever the user wants to: compare two versions of a website visually, detect UI
  regressions after a migration or upgrade (e.g. Next.js v14 → v16), validate a
  redesign, or check that pages look identical between two environments. Triggers on
  phrases like "visual regression", "compare pages visually", "screenshot diff",
  "check if pages look the same", "VRT", "visual testing between old and new URL",
  or "batch screenshot comparison". Always use this skill for any URL-pair comparison
  task regardless of how many URLs are involved.
compatibility: "Requires: Node.js 18+, npm. Scripts use Playwright (for screenshots) and pixelmatch (for pixel diffing). Basic auth support built-in."
---

# Visual Regression Tester

Compares screenshots of old vs new URLs in parallel, generates per-page diff images,
individual reports, and a combined summary dashboard with overall deviation scores.

---

## Skill Map

| Phase | What Happens | Script |
|-------|-------------|--------|
| 1. Setup | Parse URLs, install deps | `scripts/setup.sh` |
| 2. Screenshot | Parallel Playwright captures | `scripts/capture.js` |
| 3. Diff | Pixel-level comparison | `scripts/diff.js` |
| 4. Report | HTML report + summary | `scripts/report.js` |

Read `references/config.md` for all tunable parameters.
Read `references/troubleshooting.md` for common failures.

---

## Phase 1 — Setup

### 1.1 Locate Input Files
The user provides two files: `new-urls.md` and `old-urls.md`.
Each non-empty, non-comment line in `new-urls.md` maps by line number to the
corresponding non-empty, non-comment line in `old-urls.md`.

Example:
```text
new-urls.md                    old-urls.md
https://new.example.com/a      https://old.example.com/a
https://new.example.com/b      https://old.example.com/b
```

Lines starting with `#` are comments. Blank lines are ignored in both files.
Both files must produce the same number of mapped lines.

Parse them and echo a count back to the user:
```bash
paste <(grep -v '^\s*#' new-urls.md | grep -v '^\s*$') <(grep -v '^\s*#' old-urls.md | grep -v '^\s*$') | wc -l
```
Confirm the count with the user before proceeding.

### 1.2 Install Dependencies
```bash
bash scripts/setup.sh
```
This installs: `playwright`, `pixelmatch`, `pngjs`, `sharp`, `cli-progress`.
Also runs `npx playwright install chromium --with-deps`.

### 1.3 Configuration
Create `vrt.config.json` in the working directory (see `references/config.md`).
Minimum required config:
```json
{
  "auth": { "username": "tester", "password": "tester" },
  "concurrency": 10,
  "viewport": { "width": 1440, "height": 900 },
  "threshold": 0.1,
  "outputDir": "./vrt-results"
}
```

Set `concurrency` based on page count:
- < 50 pages → `concurrency: 5`
- 50–150 pages → `concurrency: 10`
- 150–300 pages → `concurrency: 15`
- 300+ pages → `concurrency: 20`

The default skill configuration now processes every URL pair at two widths:
- `375px`
- `1440px`

Screenshots are captured at full document height.

### Popup Dismissal
Many sites display a modal or overlay popup 10–15 seconds after page load (newsletter
sign-ups, cookie banners, notifications). The capture script automatically:
1. Waits `popupDismissWait` milliseconds (default `2500`) after the full-page scroll
   so timed popups have time to appear.
2. Iterates through a list of common close-button CSS selectors and clicks any that are
   visible.
3. Presses `Escape` as a final fallback to dismiss native browser dialogs.
4. Also registers a `dialog` event handler that auto-dismisses any JavaScript
   `alert` / `confirm` / `prompt` that fires during navigation.

Override the default selector list via `"popupSelectors": [...]` in `vrt.config.json`.
Adjust timing with `"popupDismissWait": 3000` (milliseconds).

### Style Normalization
Before the page scroll, the script injects a `<style>` tag that disables CSS
animations and transitions for the duration of the capture:
```css
*, *::before, *::after {
  animation: none !important;
  transition: none !important;
  scroll-behavior: auto !important;
}
```
Any playing `<video>` elements are also paused and reset to `currentTime = 0`.
This prevents mid-animation frames, blinking cursors, and other random visual
differences from polluting the diff.

---

## Phase 2 — Screenshot Capture

```bash
node scripts/capture.js --new-input new-urls.md --old-input old-urls.md --config vrt.config.json
```

This script:
- Reads URL pairs by matching `new-urls.md` and `old-urls.md` line by line
- Launches a Chromium browser pool (size = `concurrency`)
- For each URL pair, captures both configured breakpoints (`375px` and `1440px` by default)
- Captures screenshots at full document height
- Handles HTTP Basic Auth automatically using the config credentials
- Waits for the configured page load states to settle before capturing
- Scrolls to the end of the page until the document height stops growing so lazy sections can render
- Waits again after the scroll pass before taking the final full-page screenshot
- Saves screenshots as:
  ```
  vrt-results/screenshots/<slug>/new.png
  vrt-results/screenshots/<slug>/old.png
  ```
- Writes `vrt-results/capture-manifest.json` with status per URL pair

`<slug>` is derived from the URL path, e.g. `/products/shoes` → `products-shoes`.

Progress is shown with a live progress bar. Errors (timeouts, auth failures, 404s)
are logged but do not stop the batch — they are marked `status: "error"` in the
manifest.

---

## Phase 3 — Pixel Diff

```bash
node scripts/diff.js --config vrt.config.json
```

This script reads `capture-manifest.json` and for every successful screenshot pair:
- Processes each breakpoint independently
- Aligns both images to the same dimensions (pads shorter one)
- Runs `pixelmatch` at the configured `threshold`
- Saves `vrt-results/diffs/<slug>/diff.png` (red highlights on changed pixels)
- Saves `vrt-results/diffs/<slug>/composite.png` (side-by-side: old | diff | new)
- Writes per-page stats to `vrt-results/diff-results.json`:
  ```json
  {
    "slug": "products-shoes",
    "newUrl": "https://...",
    "oldUrl": "https://...",
    "totalPixels": 1296000,
    "diffPixels": 1234,
    "diffPercent": 0.095,
    "status": "pass" | "fail" | "error",
    "compositeImage": "diffs/products-shoes/composite.png"
  }
  ```

**Pass/fail threshold** is configurable (default `0.1%` — meaning > 0.1% pixel
difference = fail). Override with `"failThreshold": 0.5` in config for stricter/looser.

---

## Phase 4 — Report Generation

```bash
node scripts/report.js --config vrt.config.json
```

Generates two outputs:

### 4a. Per-Page Report
`vrt-results/pages/<slug>/index.html` — shows:
- **Breakpoint summary bar** at the top: one card per breakpoint showing the deviation %,
  diff pixel count, and pass/fail badge — both 375 px and 1440 px visible at a glance
- For each breakpoint (separate collapsible section):
  - Pixel diff stats (total pixels, diff pixels, % deviation)
  - Side-by-side composite: OLD | DIFF | NEW
  - Individual old / diff / new screenshots
- Pass/fail badge per breakpoint

### 4b. Combined Summary Dashboard
`vrt-results/index.html` — shows:
- **Overview cards**: total pages, pages passed, pages failed, pages errored,
  plus one "Avg Deviation" card per each configured breakpoint (e.g. Avg 375px and Avg 1440px)
- **Summary table**: one row per page slug (not per capture) with columns:
  - Page Slug (linked to detail report)
  - New URL / Old URL
  - Status (worst status across all breakpoints for that page)
  - One **Deviation %** column per configured breakpoint (e.g. `375px Deviation`, `1440px Deviation`)
  - Each deviation cell shows a colour-coded progress bar and the % value
- Sortable by slug, status, or any breakpoint deviation column
- Filterable by status (pass/fail/error) and free-text search
- Export as CSV button (CSV still exports one row per capture for machine readability)

Open the report:
```bash
open vrt-results/index.html      # macOS
xdg-open vrt-results/index.html  # Linux
```

Or start a quick local server:
```bash
npx serve vrt-results/
```

---

## Full Pipeline (One Command)

After setup, the user can run everything at once:
```bash
node scripts/run-all.js --new-input new-urls.md --old-input old-urls.md --config vrt.config.json
```
This runs the phases sequentially and prints ongoing progress:
- upfront page-count and ETA estimate
- phase-by-phase progress (`1/3`, `2/3`, `3/3`)
- live progress bars inside capture and diff
- elapsed time and remaining ETA after each phase

For large runs, prefer the wrapper above or run each phase manually if you want to pause and inspect outputs between steps.

---

## Output Structure
```
vrt-results/
├── index.html                    ← Combined summary dashboard
├── capture-manifest.json         ← Raw capture status per URL pair
├── diff-results.json             ← Per-page diff stats (machine-readable)
├── summary.csv                   ← CSV export of all results
├── screenshots/
│   └── <slug>/
│       ├── new.png
│       └── old.png
├── diffs/
│   └── <slug>/
│       ├── diff.png              ← Red-highlighted pixel diff
│       └── composite.png         ← old | diff | new side-by-side
└── pages/
    └── <slug>/
        └── index.html            ← Per-page detailed report
```

---

## Interpreting Results

| Diff % | Meaning |
|--------|---------|
| 0.00% | Pixel-perfect match |
| 0.01–0.10% | Negligible — likely anti-aliasing or font rendering |
| 0.10–1.00% | Minor visual change — inspect diff image |
| 1.00–5.00% | Moderate regression — likely layout shift or missing styles |
| > 5.00% | Major regression — broken layout, missing images, or wrong page |

After a Next.js v14 → v16 migration, expect 0–0.10% on well-migrated pages. Any page
above 1% warrants manual inspection of the composite image.

---

## Re-Running Failed Pages Only

After the initial run, re-test only pages that errored or failed:
```bash
node scripts/capture.js --new-input new-urls.md --old-input old-urls.md --config vrt.config.json --retry-failed
node scripts/diff.js --config vrt.config.json --retry-failed
node scripts/report.js --config vrt.config.json
```
This reads `capture-manifest.json` and skips already-successful captures.

---

## Sharing Results

Zip the results for sharing:
```bash
zip -r vrt-report-$(date +%Y%m%d).zip vrt-results/
```
The HTML report is fully self-contained (images embedded as base64 in the per-page
reports, summary uses relative paths — keep the folder structure intact when sharing).