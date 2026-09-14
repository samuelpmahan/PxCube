import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadManifest, validateManifestShape } from './manifest.mjs';
import { hashSources } from './hasher.mjs';
import { findMountUses, findPersistedMountPrefixes } from './scanner.mjs';

export class PackageError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PackageError';
    this.code = code;
  }
}

const BUILD_TIMEOUT_MS = 120_000;
const STREAM_CAP = 200 * 1024;

async function collectSourceFiles(appDir, excludedTopDirs) {
  const files = [];
  async function walk(dir, relBase) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || excludedTopDirs.includes(entry.name)) continue;
        if (relBase === '' && excludedTopDirs.includes(entry.name)) continue;
        await walk(join(dir, entry.name), relBase ? `${relBase}/${entry.name}` : entry.name);
      } else if (entry.isFile()) {
        const rel = relBase ? `${relBase}/${entry.name}` : entry.name;
        let content;
        try {
          content = await readFile(join(dir, entry.name), 'utf8');
        } catch {
          continue; // skip binary-unreadable silently
        }
        files.push({ path: rel, content });
      }
    }
  }
  await walk(appDir, '');
  return files;
}

async function listOutputFiles(outDirAbs) {
  const out = [];
  async function walk(dir, relBase) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const rel = relBase ? `${relBase}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(join(dir, entry.name), rel);
      else if (entry.isFile()) out.push(rel);
    }
  }
  await walk(outDirAbs, '');
  return out.sort();
}

function runBuild(command, cwd) {
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn('sh', ['-c', command], { cwd });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, BUILD_TIMEOUT_MS);
    child.stdout.on('data', (d) => {
      stdout += d.toString();
      if (stdout.length > STREAM_CAP) stdout = stdout.slice(-STREAM_CAP);
    });
    child.stderr.on('data', (d) => {
      stderr += d.toString();
      if (stderr.length > STREAM_CAP) stderr = stderr.slice(-STREAM_CAP);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ exitCode: timedOut ? null : code, stdout, stderr, timedOut, durationMs: Date.now() - started });
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ exitCode: null, stdout, stderr: stderr + err.message, timedOut, durationMs: Date.now() - started });
    });
  });
}

function tailLines(text, n = 20) {
  return text.trim().split('\n').slice(-n).join('\n');
}

function shortHash(hex) {
  return `${hex.slice(0, 8)}...`;
}

function defaultPxcPath() {
  return new URL('../../mock-pxc/mock-pxc.mjs', import.meta.url).href;
}

async function gather(appDir, pxcPath) {
  const manifest = await loadManifest(appDir);
  const shapeErrors = validateManifestShape(manifest);
  if (shapeErrors.length > 0) {
    throw new PackageError('manifest', shapeErrors.join('; '));
  }
  const sourceHash = await hashSources(appDir, [manifest.outDir, '.crisp']);
  if (manifest.sourceHash && manifest.sourceHash !== sourceHash) {
    throw new PackageError(
      'drift',
      `source/manifest drift: manifest records sourceHash ${shortHash(manifest.sourceHash)} ` +
        `but current tree hashes to ${shortHash(sourceHash)}`,
    );
  }
  const pxc = await import(pxcPath ?? defaultPxcPath());
  for (const mount of manifest.mounts) {
    if (!pxc.hasWorld(mount)) {
      throw new PackageError(
        'mounts',
        `unknown mount/world "${mount}" (known: ${pxc.listWorlds().join(', ')})`,
      );
    }
  }
  const files = await collectSourceFiles(appDir, [manifest.outDir, '.crisp']);
  const uses = findMountUses(files);
  const declared = new Set(manifest.mounts);
  const usedMounts = [...new Set(uses.map((u) => u.mount))].sort();
  for (const u of uses) {
    if (!declared.has(u.mount)) {
      throw new PackageError(
        'mounts',
        `undeclared mount "${u.mount}" used at ${u.file}:${u.line} (declared mounts: ${manifest.mounts.join(', ')})`,
      );
    }
  }
  const violations = findPersistedMountPrefixes(files, manifest.mounts);
  if (violations.length > 0) {
    const v = violations[0];
    throw new PackageError(
      'mounts',
      `persisted address keeps mount prefix "${v.address ?? v.mount}" at ${v.file}:${v.line}; ` +
        'persisted Part addresses must be px|fn|oc|sc.* without the mount prefix',
    );
  }
  return { manifest, sourceHash, files, uses, usedMounts };
}

export async function checkApp(appDir, { pxcPath } = {}) {
  const { manifest, sourceHash, usedMounts } = await gather(appDir, pxcPath);
  return { ok: true, mounts: manifest.mounts, usedMounts, sourceHash };
}

export async function packageApp(appDir, { pxcPath } = {}) {
  const { manifest, sourceHash, usedMounts } = await gather(appDir, pxcPath);
  const packagedAt = new Date().toISOString();

  const build = await runBuild(manifest.build, appDir);
  if (build.timedOut || build.exitCode !== 0) {
    const why = build.timedOut
      ? 'timed out'
      : `exit ${build.exitCode}`;
    throw new PackageError(
      'build',
      `build failed (${why}): ${tailLines(build.stderr || build.stdout)}`,
    );
  }

  const outDirAbs = join(appDir, manifest.outDir);
  let outputs;
  try {
    const st = await stat(outDirAbs);
    if (!st.isDirectory()) throw new Error('not a directory');
    outputs = await listOutputFiles(outDirAbs);
  } catch (err) {
    throw new PackageError('output', `output dir "${manifest.outDir}" missing after build: ${err.message}`);
  }
  if (outputs.length === 0) {
    throw new PackageError('output', `output dir "${manifest.outDir}" contains no files after build`);
  }

  const crispDir = join(appDir, '.crisp');
  await mkdir(crispDir, { recursive: true });
  await writeFile(
    join(crispDir, 'manifest.snapshot.json'),
    JSON.stringify({ ...manifest, resolvedMounts: manifest.mounts, sourceHash, packagedAt }, null, 2),
  );

  const manifestRaw = await readFile(join(appDir, 'experience.json'));
  const receipt = {
    app: manifest.title,
    version: manifest.version ?? null,
    mounts: manifest.mounts,
    resolvedMounts: manifest.mounts,
    usedMounts,
    sourceHash,
    manifestHash: createHash('sha256').update(manifestRaw).digest('hex'),
    build: {
      command: manifest.build,
      exitCode: build.exitCode,
      durationMs: build.durationMs,
      timedOut: build.timedOut,
    },
    outputs,
    validation: {
      declaredMounts: manifest.mounts,
      usedMounts,
      undeclaredMounts: [],
      persistedPrefixViolations: [],
    },
    packagedAt,
  };
  await writeFile(join(crispDir, 'receipt.json'), JSON.stringify(receipt, null, 2));
  return receipt;
}
