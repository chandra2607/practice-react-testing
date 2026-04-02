# VRT Troubleshooting Guide

---

## Capture Errors

### `Error: Target closed` or `Browser has been closed`
**Cause:** Too many concurrent browser contexts — system ran out of memory.
**Fix:** Reduce `concurrency` in config (try halving it).

### `Timeout exceeded` on many pages
**Cause:** Server too slow, or `waitUntil: "networkidle"` never fires (infinite polls).
**Fix Options:**
1. Increase `timeout` to `60000`
2. Change `waitUntil` to `"domcontentloaded"`
3. Check if the site has long-polling/websockets keeping network busy

### All pages showing Basic Auth popup / 401
**Cause:** HTTP Basic Auth credentials wrong or format issue.
**Fix:** Double-check `auth.username` and `auth.password` in config.
Also verify the auth popup is actually HTTP Basic Auth (not a custom login form).

For custom login forms, the capture script needs modification — read the form's
HTML, fill the inputs with Playwright, and submit before screenshotting.

### Screenshots are blank white / all same
**Cause:** Page JavaScript failed to run (CSP, missing bundle, React crash).
**Fix:**
1. Open the URL manually in a browser and check for errors
2. Add `waitAfterLoad: 2000` to let JS execute
3. Check if the site requires cookies/session tokens (not covered by Basic Auth)

### `net::ERR_NAME_NOT_RESOLVED` for all pages
**Cause:** Domain not reachable from the machine running the script.
**Fix:** Check DNS / VPN access. Test with `curl <url>` first.

### Some URLs produce garbled/incomplete screenshots
**Cause:** Page has lazy-loaded images or scroll-triggered animations.
**Fix:** The script already auto-scrolls before capturing, but increase `waitAfterLoad`
to `2000` or `3000` to give more time for deferred content to load.

---

## Diff Errors

### `Error: Input file is missing or of an unsupported image type`
**Cause:** A screenshot PNG is corrupted or zero-byte (failed capture).
**Fix:** Re-run capture with `--retry-failed` flag.

### Diff shows 100% on pages that look identical
**Cause:** Image dimensions differ significantly — one screenshot is much taller
(lazy content loaded on one URL but not the other), so pixel-by-pixel comparison
is comparing wrong areas.
**Fix:**
1. Check if one URL renders more/less content than the other
2. Try `waitAfterLoad: 2000` so both sides fully load before capture
3. For structurally different pages, a 100% diff is accurate — the layouts changed

### All diffs show exactly 0% but pages look different
**Cause:** `threshold` too high (0.5+) is masking real differences.
**Fix:** Lower `threshold` to `0.1` (default).

### `sharp` installation errors on Linux
```
Error: Something went wrong installing the "sharp" module
```
**Fix:**
```bash
npm install --ignore-scripts sharp
# or
npm install sharp --platform=linux --arch=x64
```

---

## Report Errors

### Images not showing in HTML report
**Cause:** The HTML report uses relative paths — opening `index.html` as a file
(`file:///...`) works, but serving from a different directory breaks relative paths.
**Fix:** Always open from inside the `vrt-results/` directory:
```bash
npx serve vrt-results/
# then open http://localhost:3000
```

### Report shows 0 pages
**Cause:** `diff-results.json` is empty or was not generated.
**Fix:** Re-run `node scripts/diff.js --config vrt.config.json`.

---

## Performance

### Total run time estimate for 300 pages
With `concurrency: 15` and pages that load in ~2s each:
- Capture: ~300 / 15 = 20 batches × 3s = ~60s capture time
- Diff: ~300 pages × 0.5s = ~2.5 minutes
- Report: ~10s

Total: **~4-5 minutes** for 300 pages.

With `concurrency: 10`: ~8–10 minutes.
With `concurrency: 20`: ~3–4 minutes.

When full-page lazy-load scrolling is enabled, capture time can be materially higher than
the simple estimate above. For long pages with deferred sections, plan for capture to take
2x to 4x longer than the basic SSR-only estimate.

### Seeing ongoing progress during long runs
Use `node scripts/run-all.js ...` for the most visible progress output. The wrapper now prints:
- total page count and an upfront ETA estimate
- current phase and pipeline percentage
- live progress bars from capture and diff
- elapsed time and remaining ETA after each phase

If you want even tighter control, run the phases individually:
```bash
node scripts/capture.js --new-input new-urls.md --old-input old-urls.md --config vrt.config.json
node scripts/diff.js --config vrt.config.json
node scripts/report.js --config vrt.config.json
```

### Reducing memory usage
Each Playwright browser context uses ~50–100 MB RAM.
At `concurrency: 15`, that's ~1.5–3 GB RAM just for browsers.
Monitor with `htop` and reduce concurrency if you see OOM kills.

---

## Re-running Partial Results

After an interrupted or partial run, use `--retry-failed` to only redo failed pages:
```bash
node scripts/capture.js --input test-links.md --config vrt.config.json --retry-failed
node scripts/diff.js --config vrt.config.json --retry-failed
node scripts/report.js --config vrt.config.json
```

The manifest and diff results are written incrementally, so completed pages
are preserved even if the run crashes mid-way.