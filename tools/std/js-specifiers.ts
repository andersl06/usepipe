import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Relative ESM import specifiers without the `.js` extension (`from './x'`), which Node's ESM
 * resolver rejects at runtime. Replaces the gate's former `rg --pcre2` call so the gate runs where
 * ripgrep is not installed (Git Bash on Windows). A `.json` specifier (`import x from './f.json'
 * with { type: 'json' }`) already names its file and resolves, so it is not counted.
 */
export const MISSING_JS_EXTENSION = /from '\.{1,2}\/[^']*(?<!\.js|\.json)'/;

export function findMissingJsSpecifiers(file: string, text: string): string[] {
  const hits: string[] = [];
  text.split(/\r?\n/).forEach((line, index) => {
    if (MISSING_JS_EXTENSION.test(line)) hits.push(`${file}:${index + 1}:${line}`);
  });
  return hits;
}

/** Tracked and untracked-but-not-ignored files under `dirs`, like ripgrep's default walk. */
function listFiles(dirs: string[]): string[] {
  const output = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '--', ...dirs], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return output
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((file) => !file.split('/').some((part) => part.startsWith('.')) && fs.existsSync(file));
}

function main(): void {
  const dirs = process.argv.slice(2);
  if (dirs.length === 0) {
    console.error('usage: js-specifiers.ts <dir> [<dir> ...]');
    process.exitCode = 2;
    return;
  }
  for (const dir of dirs) {
    if (!fs.statSync(dir, { throwIfNoEntry: false })?.isDirectory()) {
      console.error(`missing source dir: ${dir}`);
      process.exitCode = 2;
      return;
    }
  }
  const hits = listFiles(dirs.map((dir) => dir.replaceAll(path.sep, '/'))).flatMap((file) => {
    const buffer = fs.readFileSync(file);
    if (buffer.includes(0)) return [];
    return findMissingJsSpecifiers(file, buffer.toString('utf8'));
  });
  if (hits.length > 0) process.stdout.write(`${hits.join('\n')}\n`);
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) main();
