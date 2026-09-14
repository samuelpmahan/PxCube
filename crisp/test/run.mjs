#!/usr/bin/env node
// Hardening suite for the crisp packager. Runs the CLI against fresh copies of
// the fixtures in a temp dir (packaging writes .crisp/ into the app dir and
// the drift case mutates the manifest, so fixtures are never touched in place).
//
// usage: node test/run.mjs            (run from anywhere; paths are file-relative)
// exit: 0 when every case passes, 1 otherwise.
import { spawn } from 'node:child_process';
import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CRISP = join(ROOT, 'bin', 'crisp');
const FIXTURES = join(ROOT, 'fixtures');

let passed = 0;
let failed = 0;
const failures = [];

function check(name, cond, detail = '') {
  if (cond) {
    passed++;
    process.stdout.write(`ok   ${name}\n`);
  } else {
    failed++;
    failures.push(name);
    process.stdout.write(`FAIL ${name}${detail ? ` :: ${detail}` : ''}\n`);
  }
}

function runCrisp(args, cwd) {
  return new Promise((resolve) => {
    const child = spawn('node', [CRISP, ...args], { cwd });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

function freshFixture(name) {
  const dir = mkdtempSync(join(tmpdir(), 'crisp-test-'));
  cpSync(join(FIXTURES, name), dir, { recursive: true });
  return dir;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

// 1. happy path: package the hello fixture
{
  const dir = freshFixture('hello');
  const r = await runCrisp(['package', dir], dir);
  check('hello/package exit 0', r.code === 0, `exit ${r.code}: ${r.stderr}`);
  const receiptPath = join(dir, '.crisp', 'receipt.json');
  const snapPath = join(dir, '.crisp', 'manifest.snapshot.json');
  check('hello/receipt written', existsSync(receiptPath));
  check('hello/snapshot written', existsSync(snapPath));
  if (existsSync(receiptPath)) {
    const receipt = readJson(receiptPath);
    check('hello/receipt app title', receipt.app === 'Hello Shelf', receipt.app);
    check('hello/receipt sourceHash is sha256', /^[0-9a-f]{64}$/.test(receipt.sourceHash || ''));
    check('hello/receipt has outputs', Array.isArray(receipt.outputs) && receipt.outputs.length > 0);
    check('hello/receipt usedMounts has shelf', (receipt.usedMounts || []).includes('shelf'));
    check('hello/receipt validation clean',
      (receipt.validation.undeclaredMounts || []).length === 0 &&
      (receipt.validation.persistedPrefixViolations || []).length === 0);
    const snap = readJson(snapPath);
    check('hello/snapshot sourceHash matches receipt', snap.sourceHash === receipt.sourceHash);
  }
}

// 2. check command on a clean fixture
{
  const dir = freshFixture('hello');
  const r = await runCrisp(['check', dir], dir);
  check('hello/check exit 0', r.code === 0, `exit ${r.code}: ${r.stderr}`);
  check('hello/check reports mounts', /ok: mounts \[shelf\]/.test(r.stdout), r.stdout.trim());
}

// 3. failing build -> exit 2
{
  const dir = freshFixture('broken');
  const r = await runCrisp(['package', dir], dir);
  check('broken/package exit 2', r.code === 2, `exit ${r.code}: ${r.stderr}`);
  check('broken/stderr names build failure', /crisp: build: build failed/.test(r.stderr), r.stderr.trim());
}

// 4. undeclared mount use -> exit 1, names mount and file:line
{
  const dir = freshFixture('sneaky');
  const r = await runCrisp(['package', dir], dir);
  check('sneaky/package exit 1', r.code === 1, `exit ${r.code}: ${r.stderr}`);
  check('sneaky/stderr names undeclared mount', /undeclared mount "billing"/.test(r.stderr), r.stderr.trim());
  check('sneaky/stderr names file and line', /src\/app\.js:4/.test(r.stderr), r.stderr.trim());
}

// 5. persisted mount prefix in a stored address -> exit 1
{
  const dir = freshFixture('leaky');
  const r = await runCrisp(['package', dir], dir);
  check('leaky/package exit 1', r.code === 1, `exit ${r.code}: ${r.stderr}`);
  check('leaky/stderr names persisted prefix', /persisted address keeps mount prefix "shelf\.px\.discs"/.test(r.stderr), r.stderr.trim());
}

// 6. manifest/source drift
{
  const dir = freshFixture('drift');
  const manifestPath = join(dir, 'experience.json');
  const first = await runCrisp(['package', dir], dir);
  check('drift/first package exit 0', first.code === 0, `exit ${first.code}: ${first.stderr}`);
  const hash = readJson(join(dir, '.crisp', 'receipt.json')).sourceHash;
  const manifest = readJson(manifestPath);
  manifest.sourceHash = hash; // pin the packaged hash (hasher ignores this key)
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  const clean = await runCrisp(['check', dir], dir);
  check('drift/check clean after pin exit 0', clean.code === 0, `exit ${clean.code}: ${clean.stderr}`);
  appendFileSync(join(dir, 'src', 'index.html'), '\n<!-- drift -->\n');
  const drifted = await runCrisp(['check', dir], dir);
  check('drift/check after mutation exit 1', drifted.code === 1, `exit ${drifted.code}: ${drifted.stderr}`);
  check('drift/stderr names drift', /crisp: drift: source\/manifest drift/.test(drifted.stderr), drifted.stderr.trim());
  const repack = await runCrisp(['package', dir], dir);
  check('drift/repackage after mutation exit 1', repack.code === 1, `exit ${repack.code}: ${repack.stderr}`);
}

// 7. unknown mount/world against a foreign PxC -> exit 1
{
  const dir = freshFixture('unknown-world');
  const altPxc = join(dir, 'alt-pxc.mjs');
  writeFileSync(altPxc, 'export function hasWorld() { return false; }\nexport function listWorlds() { return []; }\n');
  const r = await runCrisp(['package', dir, '--pxc', altPxc], dir);
  check('unknown-world/package exit 1', r.code === 1, `exit ${r.code}: ${r.stderr}`);
  check('unknown-world/stderr names unknown mount', /unknown mount\/world "shelf"/.test(r.stderr), r.stderr.trim());
}

process.stdout.write(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) {
  process.stdout.write(`failed: ${failures.join(', ')}\n`);
  process.exit(1);
}
