#!/usr/bin/env node
// scripts/run-all.js
// Full pipeline orchestrator: capture → diff → report

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { program } = require('commander');
const { loadUrlPairs } = require('./utils/parse-links');

program
  .option('--input <file>', 'Path to test-links.md', 'test-links.md')
  .option('--new-input <file>', 'Path to new-urls.md')
  .option('--old-input <file>', 'Path to old-urls.md')
  .option('--config <file>', 'Path to vrt.config.json', 'vrt.config.json')
  .option('--retry-failed', 'Only reprocess previously failed pages')
  .parse();

const opts = program.opts();
const scriptDir = path.join(__dirname);
const totalPhases = 3;

function formatDuration(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

function estimateRuntime(pageCount, concurrency, config) {
  const breakpointCount = Array.isArray(config.breakpoints) && config.breakpoints.length > 0 ? config.breakpoints.length : 1;
  const batches = Math.max(1, Math.ceil(pageCount / Math.max(concurrency, 1)));
  const settleTime = ((config.waitAfterLoad || 0) + (config.postScrollWait || 0)) / 1000;
  const scrollPassTime = (((config.scrollDelay || 150) * 14) * (config.scrollStabilityIterations || 3)) / 1000;
  const navigationTime = config.waitUntil === 'networkidle' ? 3.5 : 2.0;
  const capturePerBatch = Math.max(5, Math.round((navigationTime + settleTime + scrollPassTime) * breakpointCount));
  const diffSeconds = Math.max(10, Math.ceil(pageCount * breakpointCount * 0.6));
  const reportSeconds = Math.max(5, Math.ceil(pageCount * breakpointCount * 0.08));
  const totalSeconds = batches * capturePerBatch + diffSeconds + reportSeconds;

  return {
    batches,
    capturePerBatch,
    diffSeconds,
    reportSeconds,
    breakpointCount,
    totalSeconds,
  };
}

function quoteArg(value) {
  return `"${String(value).replace(/"/g, '\\"')}"`;
}

function run(phaseNumber, label, cmd, pipelineStart, runtimeEstimate) {
  const phaseStart = Date.now();
  const completedPhases = phaseNumber - 1;
  const progressPercent = Math.round((completedPhases / totalPhases) * 100);

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ${label}`);
  console.log(`${'═'.repeat(60)}`);
  console.log(`   Overall progress : ${completedPhases}/${totalPhases} phases (${progressPercent}%)`);
  console.log(`   Elapsed          : ${formatDuration(Math.round((phaseStart - pipelineStart) / 1000))}`);
  console.log(`   ETA              : ~${formatDuration(Math.max(runtimeEstimate.totalSeconds - Math.round((phaseStart - pipelineStart) / 1000), 0))}`);
  try {
    execSync(cmd, { stdio: 'inherit', cwd: process.cwd() });
  } catch (err) {
    console.error(`\n❌ ${label} failed. Check errors above.`);
    console.error('   Pipeline halted. Fix the issue and re-run, or use --retry-failed.');
    process.exit(1);
  }

  const phaseElapsed = Math.round((Date.now() - phaseStart) / 1000);
  const totalElapsed = Math.round((Date.now() - pipelineStart) / 1000);
  const newCompletedPhases = phaseNumber;
  const newProgressPercent = Math.round((newCompletedPhases / totalPhases) * 100);

  console.log(`\n   ✅ Phase complete : ${label}`);
  console.log(`   Phase duration   : ${formatDuration(phaseElapsed)}`);
  console.log(`   Pipeline status  : ${newCompletedPhases}/${totalPhases} phases (${newProgressPercent}%)`);
  console.log(`   Total elapsed    : ${formatDuration(totalElapsed)}`);
  console.log(`   Remaining ETA    : ~${formatDuration(Math.max(runtimeEstimate.totalSeconds - totalElapsed, 0))}`);
}

const retryFlag = opts.retryFailed ? '--retry-failed' : '';
const inputArgs = opts.newInput && opts.oldInput
  ? `--new-input ${quoteArg(opts.newInput)} --old-input ${quoteArg(opts.oldInput)}`
  : `--input ${quoteArg(opts.input)}`;
const config = JSON.parse(fs.readFileSync(opts.config, 'utf-8'));
const pairs = loadUrlPairs({
  inputFile: opts.input,
  newFilePath: opts.newInput,
  oldFilePath: opts.oldInput,
});
const runtimeEstimate = estimateRuntime(pairs.length, config.concurrency || 10, config);

const start = Date.now();
console.log('\n🚀 VRT Pipeline Starting');
if (opts.newInput && opts.oldInput) {
  console.log(`   New    : ${opts.newInput}`);
  console.log(`   Old    : ${opts.oldInput}`);
} else {
  console.log(`   Input  : ${opts.input}`);
}
console.log(`   Config : ${opts.config}`);
console.log(`   Mode   : ${opts.retryFailed ? 'retry-failed only' : 'full run'}`);
console.log(`   Pages  : ${pairs.length}`);
console.log(`   Views  : ${runtimeEstimate.breakpointCount}`);
console.log(`   ETA    : ~${formatDuration(runtimeEstimate.totalSeconds)} total`);
console.log(`   Plan   : capture (~${formatDuration(runtimeEstimate.batches * runtimeEstimate.capturePerBatch)}) → diff (~${formatDuration(runtimeEstimate.diffSeconds)}) → report (~${formatDuration(runtimeEstimate.reportSeconds)})`);

run(
  1,
  '📸 Phase 1/3: Screenshot Capture',
  `node ${quoteArg(path.join(scriptDir, 'capture.js'))} ${inputArgs} --config ${quoteArg(opts.config)} ${retryFlag}`,
  start,
  runtimeEstimate
);

run(
  2,
  '🔬 Phase 2/3: Pixel Diff Analysis',
  `node ${quoteArg(path.join(scriptDir, 'diff.js'))} --config ${quoteArg(opts.config)} ${retryFlag}`,
  start,
  runtimeEstimate
);

run(
  3,
  '📊 Phase 3/3: Report Generation',
  `node ${quoteArg(path.join(scriptDir, 'report.js'))} --config ${quoteArg(opts.config)}`,
  start,
  runtimeEstimate
);

const elapsed = ((Date.now() - start) / 1000).toFixed(1);
console.log(`\n${'═'.repeat(60)}`);
console.log(`  ✅ VRT Pipeline Complete — ${elapsed}s`);
console.log(`${'═'.repeat(60)}`);
console.log('\n📂 Results: vrt-results/');
console.log('🌐 Report:  vrt-results/index.html');
console.log('📋 CSV:     vrt-results/summary.csv\n');