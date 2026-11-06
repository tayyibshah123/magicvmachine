// One release result for the two source gates, the packaged publication and
// cross-edition browser isolation. Reuse only unchanged, passing evidence.
import { spawn } from 'node:child_process';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sourceFingerprint } from './source-fingerprint.mjs';

const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const args = process.argv.slice(2);
function option(name, required = true) {
  const index = args.indexOf('--' + name);
  if (index < 0 || !args[index + 1] || args[index + 1].startsWith('--')) {
    if (required) throw new Error('Provide --' + name + ' PATH');
    return null;
  }
  return resolve(args[index + 1]);
}
const sources = { stable: option('stable'), guided: option('guided') };
const output = resolve(process.env.MVM_DUAL_OUTPUT_DIR || join(root, 'test-results', 'dual-' + Date.now()));
await mkdir(output, { recursive: true });
const report = { startedAt: new Date().toISOString(), editions: {}, phases: [], output };
async function run(name, script, values, cwd, env = {}) {
  const code = await new Promise(resolveCode => {
    const child = spawn(process.execPath, [script, ...values], { cwd, stdio: 'inherit', env: { ...process.env, ...env } });
    child.on('error', error => { console.error(error.message); });
    child.on('close', code => resolveCode(code ?? 1));
  });
  report.phases.push({ name, passed: code === 0, code });
  return code === 0;
}
for (const [edition, checkout] of Object.entries(sources)) {
  const existing = option(edition + '-evidence', false);
  let summary;
  if (existing) {
    try {
      summary = JSON.parse(await readFile(existing, 'utf8'));
      if (!summary.passed || !summary.shuffledAreas || !summary.browser?.passed
        || summary.sourceFingerprint !== await sourceFingerprint(checkout)) throw new Error('Evidence does not match the unchanged complete source and checks');
      report.phases.push({ name: edition + ' existing comprehensive evidence', passed: true, reused: existing });
    } catch (error) {
      report.phases.push({ name: edition + ' existing evidence', passed: false, message: error.message });
    }
  } else {
    const destination = join(output, edition);
    await run(edition + ' complete source gate', join(checkout, 'scripts/check-game.mjs'), ['--comprehensive'], checkout,
      { MVM_CHECK_OUTPUT_DIR: destination });
    try { summary = JSON.parse(await readFile(join(destination, 'summary.json'), 'utf8')); }
    catch (error) { report.phases.push({ name: edition + ' summary', passed: false, message: error.message }); }
  }
  if (summary) report.editions[edition] = summary;
}
if (report.phases.every(phase => phase.passed) && Object.values(report.editions).every(edition => edition.passed)) {
  const packaged = await run('Exact publication packaging', join(root, 'scripts/package-editions.mjs'),
    ['--stable', sources.stable, '--guided', sources.guided], root);
  if (packaged) {
    const browserOutput = join(output, 'independence');
    await run('Independent profiles, updates and offline play', join(root, 'node_modules/@playwright/test/cli.js'),
      ['test', '--config', 'playwright.editions.config.js'], root, { MVM_BROWSER_OUTPUT_DIR: browserOutput });
    try {
      const browser = JSON.parse(await readFile(join(browserOutput, 'results.json'), 'utf8'));
      const stats = browser.stats;
      report.independence = { passed: stats.expected, failed: stats.unexpected, skipped: stats.skipped, errors: browser.errors || [] };
      if (!stats.expected || stats.unexpected || stats.skipped || browser.errors?.length) {
        report.phases.push({ name: 'Independent browser evidence', passed: false });
      }
    } catch (error) { report.phases.push({ name: 'Independent browser evidence', passed: false, message: error.message }); }
  }
}
report.finishedAt = new Date().toISOString();
report.passed = Object.keys(report.editions).length === 2 && report.phases.every(phase => phase.passed)
  && Object.values(report.editions).every(edition => edition.passed) && report.independence?.passed > 0;
await writeFile(join(output, 'summary.json'), JSON.stringify(report, null, 2));
console.log('Two-edition release: ' + (report.passed ? 'passed' : 'failed') + '. Evidence: ' + output);
process.exitCode = report.passed ? 0 : 1;
