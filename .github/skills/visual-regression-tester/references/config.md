# VRT Configuration Reference

All settings live in `vrt.config.json` in your working directory.

---

## Full Config Schema

```json
{
  "auth": {
    "username": "tester",
    "password": "tester"
  },
  "concurrency": 10,
  "viewport": {
    "width": 1440,
    "height": 900
  },
  "breakpoints": [375, 1440],
  "fullPageScreenshot": true,
  "waitUntil": "networkidle",
  "waitAfterLoad": 1000,
  "postScrollWait": 1200,
  "scrollStep": 400,
  "scrollDelay": 150,
  "scrollStabilityIterations": 3,
  "timeout": 30000,
  "retryCount": 2,
  "threshold": 0.1,
  "failThreshold": 0.1,
  "outputDir": "./vrt-results"
}
```

---

## Field Reference

### `auth`
HTTP Basic Authentication credentials sent with every request.
```json
"auth": { "username": "tester", "password": "tester" }
```
Set to `{}` or omit if the site has no auth.

### `concurrency`
Number of page pairs processed simultaneously. Each pair opens 2 browser contexts
(old + new), so actual open tabs = `concurrency × 2`.

| Pages | Recommended | Reason |
|-------|-------------|--------|
| < 50  | 5           | Light load, safe for low-memory machines |
| 50–150 | 10         | Default, works on most CI machines |
| 150–300 | 15        | Fast, requires ~4 GB RAM |
| 300+  | 20          | Maximum recommended — monitor RAM |

Too high: browser crashes with "Target closed" errors → reduce concurrency.
Too low: slow but always safe.

### `viewport`
Browser window size for screenshots. Use your site's primary desktop resolution.
```json
"viewport": { "width": 1440, "height": 900 }
```

For mobile testing, add a second run with:
```json
"viewport": { "width": 390, "height": 844 }
```

### `breakpoints`
List of viewport widths to process for every URL pair. The default skill setup now
captures mobile and desktop widths in a single run.
```json
"breakpoints": [375, 1440]
```

You can also provide full objects when you need custom labels or heights:
```json
"breakpoints": [
  { "id": "mobile", "label": "375px", "width": 375, "height": 812 },
  { "id": "desktop", "label": "1440px", "width": 1440, "height": 900 }
]
```

### `fullPageScreenshot`
Controls whether screenshots capture the full document height.
```json
"fullPageScreenshot": true
```

Leave this enabled for full-page VRT comparisons. Note: the capture script always
forces `fullPage: true` regardless of this setting to prevent partial captures.

### `popupDismissWait`
Milliseconds to wait **after** the full-page scroll before attempting to close any
popup, modal, or overlay. Sites often show subscription / notification popups after
10–15 seconds, so this wait ensures they have appeared before the close attempt.
```json
"popupDismissWait": 2500
```
- `0` — disable the wait (and the popup dismissal step entirely)
- `2500` — default
- `5000` — for sites with slower-appearing popups

### `popupSelectors`
Array of CSS selectors used to find and click popup close buttons. The script tries
each selector in order and clicks the first visible match it finds.
```json
"popupSelectors": [
  "button[aria-label*='close' i]",
  "[class*='popup'] [class*='close']",
  ".modal-close"
]
```
If omitted, a built-in list of ~20 common patterns is used. Override this to target
site-specific popup close buttons, e.g.:
```json
"popupSelectors": [
  "#newsletter-modal .close-btn",
  "[data-testid='dismiss-banner']"
]```

### `waitUntil`
Playwright navigation wait condition. Options:
- `"networkidle"` — waits for no network requests for 500ms ← best for Next.js
- `"domcontentloaded"` — fast but may miss lazy-loaded content
- `"load"` — waits for `window.load`

### `waitAfterLoad`
Extra milliseconds to wait after `waitUntil` fires. Used to let CSS animations
and lazy images settle before screenshotting.
- `500` — minimal wait
- `1000` — default, good for most sites
- `2000` — for heavy animation/transitions

### `postScrollWait`
Extra milliseconds to wait after the script has scrolled to the bottom and back to
the top. Use this when sections render only after entering the viewport.
- `800` — light lazy loading
- `1200` — default
- `2000` — heavy deferred sections

### `scrollStep`
Pixels to move per scroll step while forcing lazy content to render.
- `300` to `500` — good default range
- lower values are slower but more reliable for intersection-triggered sections

### `scrollDelay`
Milliseconds to wait between scroll steps.
- `100` — fast pages
- `150` — default
- `250+` — slower pages with heavy lazy hydration

### `scrollStabilityIterations`
How many bottom-reached passes must complete without the page growing taller before
the script considers the page fully expanded.
- `2` — faster
- `3` — default
- `4+` — safer for pages that append sections in multiple waves

### `timeout`
Maximum milliseconds to wait for a page to load before marking as error.
Default: `30000` (30 seconds). Increase to `60000` for slow SSR pages.

### `retryCount`
Number of times to retry a failed page capture before marking as error.
Default: `2`. Set to `0` to disable retries.

### `threshold`
Per-pixel sensitivity for pixelmatch (0 to 1).
- `0.0` — exact pixel match required
- `0.1` — default, tolerates slight color/AA differences
- `0.2` — more tolerant of rendering differences
- `0.3+` — loose, for low-fidelity checks

This is *per-pixel* tolerance, not the overall fail threshold.

### `failThreshold`
**Overall % of pixels** that must differ to mark a page as FAIL.
- `0.0` — any difference = fail
- `0.1` — default: 0.1% of pixels differ = fail (≈1,296 px on 1440×900)
- `0.5` — tolerates minor layout differences
- `1.0` — only major regressions fail

### `outputDir`
Where all output files are written.
Default: `./vrt-results`

---

## Quick Configs

### After Next.js Migration (strict)
```json
{
  "auth": { "username": "tester", "password": "tester" },
  "concurrency": 15,
  "breakpoints": [375, 1440],
  "fullPageScreenshot": true,
  "threshold": 0.1,
  "failThreshold": 0.1,
  "waitUntil": "networkidle",
  "waitAfterLoad": 1500,
  "postScrollWait": 1500,
  "scrollStabilityIterations": 3
}
```

### Design Review (lenient)
```json
{
  "concurrency": 10,
  "breakpoints": [375, 1440],
  "threshold": 0.2,
  "failThreshold": 1.0,
  "waitAfterLoad": 500
}
```

### CI / Fast (no retries)
```json
{
  "concurrency": 20,
  "breakpoints": [375, 1440],
  "retryCount": 0,
  "timeout": 15000,
  "waitUntil": "domcontentloaded",
  "waitAfterLoad": 0
}
```