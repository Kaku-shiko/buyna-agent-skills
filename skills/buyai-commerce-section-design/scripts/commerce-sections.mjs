import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileCommercePage } from './commerce-section-core.mjs';
export { compileCommercePage, getCommerceSectionCatalog, selectCommerceSectionItems } from './commerce-section-core.mjs';

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--input') (()=>{ throw new Error('USAGE: --input <page-config.json>'); })();
  const input = JSON.parse(readFileSync(resolve(args[1]), 'utf8').replace(/^\uFEFF/, ''));
  console.log(JSON.stringify(compileCommercePage(input), null, 2));
}
