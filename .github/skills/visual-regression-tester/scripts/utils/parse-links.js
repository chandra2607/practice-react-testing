// scripts/utils/parse-links.js
// Parses either a combined test-links.md file or separate new/old URL files.

const fs = require('fs');
const path = require('path');

function readMappedLines(filePath) {
  const content = fs.readFileSync(path.resolve(filePath), 'utf-8');
  const rawLines = content.split('\n');
  const lines = [];

  for (let i = 0; i < rawLines.length; i++) {
    const value = rawLines[i].trim();
    if (!value || value.startsWith('#')) continue;
    lines.push({ value, lineNumber: i + 1 });
  }

  return lines;
}

/**
 * Parse a test-links file into URL pairs.
 * Supports whitespace (spaces/tabs) as separator.
 * Skips comment lines (#) and blank lines.
 * @param {string} filePath
 * @returns {{ newUrl: string, oldUrl: string, slug: string }[]}
 */
function parseLinksFile(filePath) {
  const lines = readMappedLines(filePath);
  const pairs = [];

  for (const line of lines) {
    const parts = line.value.split(/\s+/).filter(Boolean);
    if (parts.length < 2) {
      console.warn(`⚠️  Line ${line.lineNumber}: expected 2 URLs, got ${parts.length} — skipping: "${line.value}"`);
      continue;
    }

    const [newUrl, oldUrl] = parts;
    const slug = urlToSlug(newUrl);
    pairs.push({ newUrl, oldUrl, slug, lineNumber: line.lineNumber });
  }

  return pairs;
}

/**
 * Parse separate new/old URL files where each non-empty, non-comment line maps by index.
 * @param {string} newFilePath
 * @param {string} oldFilePath
 * @returns {{ newUrl: string, oldUrl: string, slug: string }[]}
 */
function parseParallelUrlFiles(newFilePath, oldFilePath) {
  const newLines = readMappedLines(newFilePath);
  const oldLines = readMappedLines(oldFilePath);

  if (newLines.length !== oldLines.length) {
    throw new Error(
      `URL file line count mismatch: ${path.basename(newFilePath)} has ${newLines.length} mapped lines, ` +
      `${path.basename(oldFilePath)} has ${oldLines.length}`
    );
  }

  return newLines.map((newEntry, index) => {
    const oldEntry = oldLines[index];
    return {
      newUrl: newEntry.value,
      oldUrl: oldEntry.value,
      slug: urlToSlug(newEntry.value),
      lineNumber: newEntry.lineNumber,
      oldLineNumber: oldEntry.lineNumber,
    };
  });
}

/**
 * Convert a URL to a safe filesystem slug.
 * e.g. "https://new.example.com/products/shoes?color=red" → "products-shoes"
 */
function urlToSlug(url) {
  try {
    const parsed = new URL(url);
    let slug = parsed.pathname
      .replace(/^\//, '')        // remove leading slash
      .replace(/\/$/, '')        // remove trailing slash
      .replace(/\//g, '-')       // slashes → dashes
      .replace(/[^a-z0-9-_]/gi, '-')  // non-alphanumeric → dashes
      .replace(/-+/g, '-')       // collapse multiple dashes
      .toLowerCase();

    if (!slug) slug = 'root';

    // Append query hash to avoid slug collisions
    if (parsed.search) {
      const hash = Buffer.from(parsed.search).toString('base64').slice(0, 6).replace(/[^a-z0-9]/gi, '');
      slug = `${slug}--${hash}`;
    }

    return slug;
  } catch {
    // Fallback for malformed URLs
    return url.replace(/[^a-z0-9]/gi, '-').slice(0, 60);
  }
}

/**
 * Deduplicate slugs by appending a counter if the same slug appears multiple times.
 */
function deduplicateSlugs(pairs) {
  const seen = {};
  return pairs.map(pair => {
    const base = pair.slug;
    if (seen[base] === undefined) {
      seen[base] = 0;
      return pair;
    } else {
      seen[base]++;
      return { ...pair, slug: `${base}-${seen[base]}` };
    }
  });
}

function loadUrlPairs({ inputFile, newFilePath, oldFilePath }) {
  if (newFilePath || oldFilePath) {
    if (!newFilePath || !oldFilePath) {
      throw new Error('Both new and old URL files are required when using split inputs.');
    }
    return parseParallelUrlFiles(newFilePath, oldFilePath);
  }

  return parseLinksFile(inputFile);
}

module.exports = { parseLinksFile, parseParallelUrlFiles, loadUrlPairs, urlToSlug, deduplicateSlugs };