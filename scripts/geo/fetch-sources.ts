/**
 * Downloads the pinned Natural Earth files into .cache/ and verifies their checksums.
 * Run with: npm run geo:fetch
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CACHE_DIR, NATURAL_EARTH_BASE, SOURCES } from './sources';

async function sha256(file: string): Promise<string | null> {
  try {
    return createHash('sha256').update(await readFile(file)).digest('hex');
  } catch {
    return null;
  }
}

await mkdir(CACHE_DIR, { recursive: true });

for (const [name, expected] of Object.entries(SOURCES)) {
  const file = path.join(CACHE_DIR, name);
  if ((await sha256(file)) === expected) {
    console.log(`ok       ${name}`);
    continue;
  }
  const url = `${NATURAL_EARTH_BASE}/${name}`;
  console.log(`fetching ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status}) for ${url}`);
  await writeFile(file, Buffer.from(await res.arrayBuffer()));
  const actual = await sha256(file);
  if (actual !== expected) {
    throw new Error(`Checksum mismatch for ${name}.\n  expected ${expected}\n  actual   ${actual}`);
  }
  console.log(`verified ${name}`);
}
