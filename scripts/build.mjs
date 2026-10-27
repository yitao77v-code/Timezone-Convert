import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';

await build({
  entryPoints: ['offlineParser.mjs'],
  outfile: 'offlineParser.js',
  bundle: true,
  platform: 'browser',
  format: 'iife',
  globalName: 'TimeShiftOffline',
  target: ['chrome100'],
  minify: true,
  legalComments: 'external'
});

const licenses = await Promise.all([
  readFile('node_modules/chrono-node/LICENSE.txt', 'utf8'),
  readFile('node_modules/luxon/LICENSE.md', 'utf8')
]);
await writeFile('offlineParser.js.LEGAL.txt', `chrono-node\n${licenses[0]}\nLuxon\n${licenses[1]}`);
