#!/usr/bin/env node
/**
 * logoextractor CLI.
 *
 *   logoextractor <url>              extract logos + favicons, print JSON
 *   logoextractor <url> --logo       print just the best logo link
 *   logoextractor <url> --favicon    print just the best favicon link
 *   logoextractor <url> -o out.json  write JSON output to a file
 */
import { writeFile } from 'node:fs/promises';
import { extractLogos } from './extractor.js';

type Options = { url?: string; logo: boolean; favicon: boolean; out?: string };

function parseArgs(argv: string[]): Options {
  const opts: Options = { logo: false, favicon: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--logo' || arg === '-l') {
      opts.logo = true;
    } else if (arg === '--favicon' || arg === '-f') {
      opts.favicon = true;
    } else if (arg === '--out' || arg === '-o') {
      opts.out = argv[++i];
    } else if (!arg.startsWith('-') && !opts.url) {
      opts.url = arg;
    }
  }
  return opts;
}

function usage(): never {
  process.stderr.write(
    'usage: logoextractor <url> [--logo] [--favicon] [--out <file>]\n' +
      '\n' +
      '  <url>            website to analyze\n' +
      '  --logo, -l       print only the best logo link\n' +
      '  --favicon, -f    print only the best favicon link\n' +
      '  --out, -o <file> write output to a file instead of stdout\n',
  );
  process.exit(1);
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.url) usage();

  const result = await extractLogos(opts.url);

  let output: string;
  if (opts.logo) {
    output = result.logo ?? '';
  } else if (opts.favicon) {
    output = result.favicon ?? '';
  } else {
    output = JSON.stringify(result, null, 2);
  }

  if (opts.out) {
    await writeFile(opts.out, output + '\n', 'utf-8');
    process.stderr.write(`wrote ${opts.out}\n`);
  } else {
    process.stdout.write(output + '\n');
  }
}

main().catch((e: unknown) => {
  process.stderr.write(`ERROR: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
