/**
 * Live end-to-end smoke check against real sites (hits the network).
 *
 *   npm run smoke
 *   npm run smoke -- https://your-site.com
 */
import { extractLogos } from '../lib/extractor.js';

const sites = process.argv.slice(2);
const targets = sites.length ? sites : ['https://stripe.com', 'https://github.com'];

for (const site of targets) {
  try {
    const result = await extractLogos(site);
    process.stdout.write(`\n=== ${site} ===\n`);
    process.stdout.write(`logo:    ${result.logo ?? '(none)'}\n`);
    process.stdout.write(`favicon: ${result.favicon ?? '(none)'}\n`);
    process.stdout.write(`  ${result.logos.length} logo candidate(s), ${result.favicons.length} favicon(s)\n`);
  } catch (e) {
    process.stderr.write(`\n=== ${site} ===\nERROR: ${e instanceof Error ? e.message : String(e)}\n`);
  }
}
