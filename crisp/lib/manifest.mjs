import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function loadManifest(appDir) {
  const path = join(appDir, 'experience.json');
  let raw;
  try {
    raw = await readFile(path, 'utf8');
  } catch (err) {
    throw new Error(`manifest: cannot read ${path}: ${err.message}`);
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`manifest: ${path} is not valid JSON: ${err.message}`);
  }
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
