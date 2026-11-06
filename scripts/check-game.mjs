import { spawn, execFileSync } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { resolve, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TEST_GROUPS, groupFor } from './test-groups.mjs';
import { sourceFingerprint } from './source-fingerprint.mjs';

const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const args = process.argv.slice(2);
const areaIndex = args.indexOf('--area');
const area = areaIndex >= 0 ? args[areaIndex + 1] : null;
if (areaIndex >= 0 && (!area || area.startsWith('--'))) throw new Error('Choose an area with --area NAME. Use --list to see the available names.');
if (area && args.includes('--browser-only')) throw new Error('--area and --browser-only cannot be combined.');
if (area && !TEST_GROUPS[area]) throw new Error('Unknown area. Choose: ' + Object.keys(TEST_GROUPS).join(', '));
if (args.includes('--list')) {
  for (const [key, group] of Object.entries(TEST_GROUPS)) console.log(key + ': ' + group.label);
  process.exit();
}
const id = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
const output = resolve(process.env.MVM_CHECK_OUTPUT_DIR || join(root, 'test-results', id));
await mkdir(output, { recursive: true });
const report = {
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  workingTreeChanged: !!execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim(),
  scope: area ? 'Unit and integration area: ' + area : (args.includes('--browser-only') ? 'Browser and bundle checks' : 'Complete game checks'),
  startedAt: new Date().toISOString(), areas: {}, phases: [],
  limitations: ['Desktop touch emulation does not verify physical iPhone Safari or Android OS Back.']
};
report.sourceFingerprint = await sourceFingerprint(root);
const run = async (name, commandArgs, extraEnv = {}) => {
  const began = performance.now();
  console.log('\nChecking ' + name);
  const childEnv = { ...process.env, ...extraEnv, FORCE_COLOR: '0' };
  delete childEnv.NO_COLOR;
  const logFile = join(output, String(report.phases.length + 1).padStart(2, '0') + '-' + name.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-') + '.log');
  const code = await new Promise(resolveCode => {
    const log = createWriteStream(logFile);
    const child = spawn(process.execPath, commandArgs, { cwd: root, stdio: ['inherit', 'pipe', 'pipe'], env: childEnv });
    child.stdout.on('data', chunk => { process.stdout.write(chunk); log.write(chunk); });
    child.stderr.on('data', chunk => { process.stderr.write(chunk); log.write(chunk); });
    child.on('error', error => { console.error(error.message); log.write(error.message + '\n'); });
    child.on('close', code => log.end(() => resolveCode(code ?? 1)));
  });
  report.phases.push({ name, status: code === 0 ? 'passed' : 'failed', code, elapsedMs: Math.round(performance.now() - began), log: logFile });
  return code === 0;
};
const files = (await readdir(join(root, 'src/__tests__'), { recursive: true })).filter(f => f.endsWith('.test.js'));
const unmapped = files.filter(f => !groupFor(f));
if (unmapped.length) {
  console.error('Assign these checks to a reporting area: ' + unmapped.join(', '));
  report.phases.push({ name: 'Coverage ownership', status: 'failed', files: unmapped });
}
const summarizeUnit = async (file, label) => {
  try {
    const data = JSON.parse(await readFile(file, 'utf8'));
    const destination = label === 'normal' ? report.areas : (report.shuffledAreas ||= {});
    for (const result of data.testResults) {
      const key = groupFor(result.name) || 'unassigned';
      const summary = destination[key] ||= { label: TEST_GROUPS[key]?.label || key, passed: 0, failed: 0, unexecuted: 0, failures: [] };
      if (result.status === 'failed' && !result.assertionResults.length) {
        (summary.suiteErrors ||= []).push({ file: basename(result.name), message: result.message || result.failureMessages });
        report.phases.push({ name: label + ' collection: ' + basename(result.name), status: 'failed', message: result.message || result.failureMessages });
      }
      for (const check of result.assertionResults) {
        if (check.status === 'passed') summary.passed++;
        else if (check.status === 'failed') { summary.failed++; summary.failures.push({ run: label, file: basename(result.name), name: check.fullName, messages: check.failureMessages }); }
        else summary.unexecuted++;
      }
    }
  } catch (error) {
    report.phases.push({ name: label + ' report', status: 'failed', message: error.message });
  }
};
if (!args.includes('--browser-only')) {
  const selected = area ? files.filter(f => groupFor(f) === area).map(f => 'src/__tests__/' + f) : [];
  const result = join(output, 'unit.json');
  await rm(result, { force: true });
  await run('Automated rules and integration', ['node_modules/vitest/vitest.mjs', 'run', ...selected, '--reporter=json', '--outputFile', result]);
  await summarizeUnit(result, 'normal');
  if (args.includes('--comprehensive')) {
    const shuffled = join(output, 'unit-shuffled.json');
    await rm(shuffled, { force: true });
    await run('Shuffled order and isolation', ['node_modules/vitest/vitest.mjs', 'run', ...selected, '--sequence.shuffle', '--sequence.seed=20261106', '--reporter=json', '--outputFile', shuffled]);
    await summarizeUnit(shuffled, 'shuffled');
  }
}
if (!area) {
  const built = await run('Web bundle', ['scripts/build-www.mjs']);
  const valid = built && await run('Bundle contracts', ['scripts/validate-build.mjs']);
  if (valid) {
    await rm(join(output, 'browser/results.json'), { force: true });
    await run('Mobile browser journeys and regressions', ['node_modules/@playwright/test/cli.js', 'test'], { MVM_BROWSER_OUTPUT_DIR: join(output, 'browser') });
    try {
      const browser = JSON.parse(await readFile(join(output, 'browser/results.json'), 'utf8'));
      const cases = [];
      const collect = suites => {
        for (const suite of suites || []) {
          for (const spec of suite.specs || []) for (const test of spec.tests || []) {
            const result = test.results?.at(-1);
            cases.push({ file: spec.file, name: spec.title, status: result?.status || 'unexecuted',
              durationMs: result?.duration, error: result?.error?.message,
              errors: result?.errors, attachments: result?.attachments?.map(({ name, path, contentType }) => ({ name, path, contentType })) });
          }
          collect(suite.suites);
        }
      };
      collect(browser.suites);
      report.browser = {
        reportFile: join(output, 'browser/results.json'),
        passed: cases.filter(c => c.status === 'passed').length,
        failed: cases.filter(c => ['failed', 'timedOut', 'interrupted'].includes(c.status)).length,
        unexecuted: cases.filter(c => !['passed', 'failed', 'timedOut', 'interrupted'].includes(c.status)).length,
        cases, globalErrors: browser.errors || []
      };
    } catch (error) { report.phases.push({ name: 'Browser evidence', status: 'failed', message: error.message }); }
  }
}
report.finishedAt = new Date().toISOString();
const finalFingerprint = await sourceFingerprint(root);
report.phases.push({ name: 'Frozen source and test inputs',
  status: finalFingerprint === report.sourceFingerprint ? 'passed' : 'failed',
  ...(finalFingerprint === report.sourceFingerprint ? {} : { message: 'Source or checks changed during this run. Verify the final inputs again.' }) });
const executedChecks = Object.values(report.areas).reduce((n, a) => n + a.passed + a.failed, 0)
  + (report.browser?.passed || 0) + (report.browser?.failed || 0);
if (!executedChecks) report.phases.push({ name: 'Executed checks', status: 'failed', message: 'No test cases executed.' });
report.passed = report.phases.length > 0 && report.phases.every(p => p.status === 'passed')
  && [...Object.values(report.areas), ...Object.values(report.shuffledAreas || {})].every(a => !a.failed && !a.unexecuted)
  && (!report.browser || (!report.browser.failed && !report.browser.unexecuted && !report.browser.globalErrors.length && report.browser.passed > 0));
await writeFile(join(output, 'summary.json'), JSON.stringify(report, null, 2));
console.log('\nConsolidated result');
for (const summary of Object.values(report.areas)) console.log(summary.label + ': ' + summary.passed + ' passed, ' + summary.failed + ' failed, ' + summary.unexecuted + ' unexecuted');
for (const phase of report.phases) console.log(phase.name + ': ' + phase.status);
if (report.browser) console.log('Browser cases: ' + report.browser.passed + ' passed, ' + report.browser.failed + ' failed, ' + report.browser.unexecuted + ' unexecuted');
console.log('Detailed evidence: ' + output);
process.exitCode = report.passed ? 0 : 1;
