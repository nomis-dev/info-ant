/**
 * Interactive tester: type a URL, see the extracted logos + favicons.
 *
 *   npm run try                      # prompt for URLs, one per line
 *   npm run try -- https://acme.com  # one-shot: extract, print, exit
 *
 * At the prompt: enter a URL to test, or `q` / Ctrl-D to quit.
 */
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { extractLogos } from '../lib/extractor.js';

// Normalize bare input like "acme.com" into a fetchable https URL.
function normalize(input: string): string {
  const trimmed = input.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

async function run(rawUrl: string): Promise<void> {
  const url = normalize(rawUrl);
  process.stdout.write(`\n→ ${url}\n`);
  try {
    const result = await extractLogos(url);
    process.stdout.write(`  logo:    ${result.logo ?? '(none)'}\n`);
    process.stdout.write(`  favicon: ${result.favicon ?? '(none)'}\n`);
    process.stdout.write(
      `  ${result.logos.length} logo candidate(s), ${result.favicons.length} favicon(s)\n`,
    );

    if (result.logos.length) {
      process.stdout.write('\n  logos:\n');
      for (const c of result.logos) {
        const shown = c.svg ? `<inline svg, ${c.svg.length} chars>` : c.url;
        process.stdout.write(`   [${c.source}] ${shown}\n`);
      }
    }
    if (result.favicons.length) {
      process.stdout.write('\n  favicons:\n');
      for (const c of result.favicons) {
        const meta = [c.sizes, c.type].filter(Boolean).join(' ');
        process.stdout.write(`   [${c.source}] ${c.url}${meta ? `  (${meta})` : ''}\n`);
      }
    }
  } catch (e) {
    process.stderr.write(`  ERROR: ${e instanceof Error ? e.message : String(e)}\n`);
  }
}

async function main(): Promise<void> {
  // One-shot mode: URLs passed as args.
  const args = process.argv.slice(2);
  if (args.length) {
    for (const arg of args) await run(arg);
    return;
  }

  // Interactive mode.
  const rl = createInterface({ input: stdin, output: stdout });
  process.stdout.write('logo-extractor — enter a URL to test (q or Ctrl-D to quit)\n');
  try {
    for (;;) {
      const answer = (await rl.question('\nurl> ')).trim();
      if (!answer) continue;
      if (answer === 'q' || answer === 'quit' || answer === 'exit') break;
      await run(answer);
    }
  } finally {
    rl.close();
  }
}

main().catch((e: unknown) => {
  process.stderr.write(`ERROR: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
