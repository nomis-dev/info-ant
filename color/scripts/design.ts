/**
 * Generate a Google-Stitch-ready design.md for a website's color system.
 *
 *   npm run design -- https://fypro.ai/
 *   npm run design -- https://fypro.ai/ design.md   # write to file
 */
import { writeFile } from 'node:fs/promises';
import { extractDesign } from '../lib/design.js';

async function main() {
  const [url, outFile] = process.argv.slice(2);
  if (!url) {
    console.error('usage: npm run design -- <url> [outFile]');
    process.exit(1);
  }

  const { tokens, markdown } = await extractDesign(url);

  if (outFile) {
    await writeFile(outFile, markdown, 'utf-8');
    console.error(`wrote ${outFile}`);
  } else {
    process.stdout.write(markdown);
  }

  console.error('\n--- token summary ---');
  console.error(JSON.stringify(tokens, null, 2));
}

main().catch((e) => {
  console.error('ERROR:', (e as Error).message);
  process.exit(1);
});
