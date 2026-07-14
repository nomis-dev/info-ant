/**
 * Live smoke test — hits real sites over the network to sanity-check the full
 * pipeline (fetch + parse + image palette). Skipped in CI by default.
 *
 *   npm run smoke                       # uses a default URL list
 *   npm run smoke -- https://stripe.com # test specific URLs
 */
import { extractColors } from '../lib/extractor.js';

const DEFAULTS = ['https://stripe.com', 'https://github.com', 'https://vercel.com'];

async function main() {
  const urls = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULTS;
  let failures = 0;

  for (const url of urls) {
    process.stdout.write(`\n→ ${url}\n`);
    try {
      const r = await extractColors(url);
      console.log(`  source:     ${r.source}`);
      console.log(`  primary:    ${r.primary} (${r.isLight ? 'light' : 'dark'})`);
      console.log(`  themeColor: ${r.themeColor}`);
      console.log(`  imageUsed:  ${r.imageUsed ?? '(none)'}`);
      console.log(`  palette:    ${JSON.stringify(r.palette)}`);
      console.log(`  cssColors:  ${r.cssColors.slice(0, 5).join(', ') || '(none)'}`);
      if (!r.primary) {
        console.warn('  WARN: no primary color found');
        failures++;
      }
    } catch (e) {
      console.error(`  ERROR: ${(e as Error).message}`);
      failures++;
    }
  }

  console.log(`\nDone. ${urls.length - failures}/${urls.length} produced a color.`);
  process.exit(failures > 0 ? 1 : 0);
}

main();
