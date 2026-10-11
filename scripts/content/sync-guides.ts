/**
 * Rewrites the data blocks in the guides from the definitions the maps use.
 *
 *   npm run guides:sync            write the guides
 *   npm run guides:sync -- --check report what is out of date and change nothing
 *
 * See guide-blocks.ts for what a data block is.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { blocksIn, withBlocks } from './guide-blocks';

const dir = 'src/content/guides';
const check = process.argv.includes('--check');
let stale = 0;

for (const name of (await readdir(dir)).filter((file) => file.endsWith('.md')).sort()) {
  const file = join(dir, name);
  const before = await readFile(file, 'utf8');
  const after = withBlocks(before);
  const blocks = blocksIn(before);
  if (before === after) {
    if (blocks.length) console.log(`up to date  ${name}  (${blocks.join(', ')})`);
    continue;
  }
  stale++;
  if (check) console.log(`OUT OF DATE ${name}`);
  else {
    await writeFile(file, after);
    console.log(`written     ${name}  (${blocks.join(', ')})`);
  }
}

if (check && stale) {
  console.error(`\n${stale} guide(s) are behind the data. Run: npm run guides:sync`);
  process.exit(1);
}
