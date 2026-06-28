import AdmZip from 'adm-zip';
import { mkdirSync, writeFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { isPathInside } from './paths.js';

export class ZipSlipError extends Error {}

/**
 * Extract a zip buffer into destDir with strict zip-slip protection: every
 * entry must resolve to a path inside destDir, otherwise we abort the whole
 * extraction. Does NOT follow symlinks (adm-zip writes file contents, not links).
 */
export function extractZipBuffer(buf: Buffer, destDir: string): number {
  const zip = new AdmZip(buf);
  const entries = zip.getEntries();

  // Pre-validate ALL entries before writing anything.
  for (const e of entries) {
    const target = join(destDir, e.entryName);
    if (!isPathInside(destDir, target)) {
      throw new ZipSlipError(`zip entry escapes target dir: ${e.entryName}`);
    }
  }

  mkdirSync(destDir, { recursive: true });
  let count = 0;
  for (const e of entries) {
    const target = join(destDir, e.entryName);
    if (e.isDirectory) {
      mkdirSync(target, { recursive: true });
    } else {
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, e.getData());
      count++;
    }
  }
  return count;
}

/** Remove everything inside dir but keep the dir itself (for project re-upload). */
export function wipeDirContents(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    return;
  }
  for (const name of readdirSync(dir)) {
    rmSync(join(dir, name), { recursive: true, force: true });
  }
}
