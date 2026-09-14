import { readFile } from 'node:fs/promises';
import { join, resolve, relative } from 'node:path';
import { provideExperience } from '../../tidy/manifest.mjs';

export async function loadManifest(appDir, { providerRoot } = {}) {
  const path = join(appDir, 'experience.json');
  let raw;
  try {
    raw = await readFile(path, 'utf8');
  } catch (err) {
    throw new Error(`manifest: cannot read ${path}: ${err.message}`);
  }
  let manifest;
  try {
    manifest = JSON.parse(raw);
  } catch (err) {
    throw new Error(`manifest: ${path} is not valid JSON: ${err.message}`);
  }
  if (manifest?.tidy) {
    if (Object.keys(manifest).length !== 1 || typeof manifest.tidy.type !== 'string') throw Error('manifest: a tidy reference must contain only tidy.type');
    const repo = resolve(appDir, '../..');
    const supplied = provideExperience(providerRoot ?? repo, manifest.tidy.type);
    if (relative(repo, resolve(appDir)) !== supplied.root) throw Error('manifest: tidy root differs from app directory');
    return { ...supplied.manifest, manifestSource: { path: supplied.source, type: supplied.type, digest: supplied.digest } };
  }
  return manifest;
}

const MOUNT_NAME_RE = /^[A-Za-z_][A-Za-z0-9_-]*$/;

function nonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

export function validateManifestShape(m) {
  const errors = [];
  if (m === null || typeof m !== 'object' || Array.isArray(m)) {
    return ['manifest must be a JSON object'];
  }
  if (!nonEmptyString(m.title)) {
    errors.push('title must be a non-empty string');
  }
  if (!Array.isArray(m.mounts)) {
    errors.push('mounts must be an array of strings');
  } else {
    for (const mount of m.mounts) {
      if (typeof mount !== 'string' || !MOUNT_NAME_RE.test(mount)) {
        errors.push(`mounts: invalid mount name ${JSON.stringify(mount)} (expected /^[A-Za-z_][A-Za-z0-9_-]*$/)`);
      }
    }
  }
  if (!nonEmptyString(m.build)) {
    errors.push('build must be a non-empty string');
  }
  if (!nonEmptyString(m.outDir)) {
    errors.push('outDir must be a non-empty string');
  }
  return errors;
}
