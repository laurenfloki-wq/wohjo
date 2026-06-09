// Read each function in prod-functions-def.txt and dump its
// search_path setting (or note absence). Used to localise the
// chat-Claude-attested functions-dimension divergence.

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const md5 = (s) => createHash('md5').update(s, 'utf8').digest('hex');
const raw = readFileSync('scripts/.116c/prod-functions-def.txt', 'utf8').replace(/\r/g, '').trim();
const lines = raw.split('\n');
console.log(`lines: ${lines.length}`);
console.log('');
console.log('function name'.padEnd(40), 'md5(line)'.padEnd(34), 'search_path');
console.log('-'.repeat(120));
for (const line of lines) {
  const m = line.match(/FUNCTION public\.(\w+)/);
  const sp = line.match(/SET search_path TO ([^\\]+?)\\n/);
  const name = m ? m[1] : '?';
  const path = sp ? sp[1] : '(no SET search_path)';
  console.log(name.padEnd(40), md5(line), path);
}
