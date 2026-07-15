#!/usr/bin/env node
/**
 * colorextractor CLI.
 *
 *   colorextractor <url>                  extract colors, print JSON
 *   colorextractor <url> --design         generate a design.md brief
 *   colorextractor <url> --design --json  print the design tokens as JSON
 *   colorextractor <url> --design -o f.md write the design brief to a file
 */
import { writeFile } from 'node:fs/promises';
import { extractColors } from './extractor.js';
import { extractDesign } from './design.js';

type Options = { url?: string; design: boolean; json: boolean; out?: string };

function parseArgs(argv: string[]): Options {
  const opts: Options = { design: false, json: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--design' || arg === '-d') {
      opts.design = true;
    } else if (arg === '--json' || arg === '-j') {
      opts.json = true;
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
    'usage: colorextractor <url> [--design] [--out <file>]\n' +
      '\n' +
      '  <url>            website to analyze\n' +
      '  --design, -d     generate a design-system markdown brief\n' +
      '  --json, -j       with --design, output design tokens as JSON\n' +
      '  --out, -o <file> write output to a file instead of stdout\n',
  );
  process.exit(1);
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.url) usage();

  if (opts.design) {
    const { tokens, markdown } = await extractDesign(opts.url);
    const output = opts.json ? JSON.stringify(tokens, null, 2) : markdown;
    if (opts.out) {
      await writeFile(opts.out, output, 'utf-8');
      process.stderr.write(`wrote ${opts.out}\n`);
    } else {
      process.stdout.write(opts.json ? output + '\n' : output);
    }
    return;
  }

  const result = await extractColors(opts.url);
  const json = JSON.stringify(result, null, 2);
  if (opts.out) {
    await writeFile(opts.out, json, 'utf-8');
    process.stderr.write(`wrote ${opts.out}\n`);
  } else {
    process.stdout.write(json + '\n');
  }
}

main().catch((e: unknown) => {
  process.stderr.write(`ERROR: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
