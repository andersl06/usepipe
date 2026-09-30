import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const domain = /usepipe\.(?:app|ai|com\.br)/i;
const allowLines = readFileSync(new URL('./domain-literals-allow.txt', import.meta.url), 'utf8')
  .split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#'));

function globRegex(glob) {
  let source = '^';
  for (let i = 0; i < glob.length; i++) {
    if (glob.slice(i, i + 3) === '**/') {
      source += '(?:.*/)?'; i += 2;
    } else if (glob.slice(i, i + 2) === '**') {
      source += '.*'; i++;
    } else if (glob[i] === '*') {
      source += '[^/]*';
    } else {
      source += glob[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`${source}$`);
}

const allow = allowLines.map((line) => {
  const separator = line.indexOf(':');
  return separator < 0
    ? { path: globRegex(line), line: null }
    : { path: globRegex(line.slice(0, separator)), line: new RegExp(line.slice(separator + 1)) };
});

const tracked = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'])
  .toString('utf8').split('\0').filter(Boolean);
let failures = 0;
for (const path of tracked) {
  let content;
  try { content = readFileSync(path, 'utf8'); } catch { continue; }
  if (content.includes('\0')) continue;
  const lines = content.split(/\r?\n/);
  lines.forEach((line, index) => {
    if (!domain.test(line)) return;
    if (allow.some((entry) => entry.path.test(path) && (entry.line === null || entry.line.test(line)))) return;
    failures++;
    console.error(`${path}:${index + 1}:${line.trim().slice(0, 200)}`);
  });
}
if (failures) {
  console.error(`${failures} production-domain literal(s) outside the allowlist`);
  process.exitCode = 1;
} else {
  console.log('No production-domain literals outside the allowlist.');
}
