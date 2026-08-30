import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('a supplied design image selects reference-faithful generation with the real image attached', () => {
  const skill = read('skills/buyna-website-design/SKILL.md');
  const board = read('skills/buyna-website-design/references/design-system-board.md');
  const contract = `${skill}\n${board}`;

  assert.match(contract, /REFERENCE_FAITHFUL/);
  assert.match(contract, /referenced_image_paths/);
  assert.match(contract, /num_last_images_to_include/);
  assert.match(contract, /exactly one|never both/i);
  assert.match(contract, /raw (?:reference|design) image|actual (?:reference|design) image/i);
  assert.match(contract, /text(?:ual)? audit alone.*(?:not|never)|never.*text(?:ual)? audit alone/is);
});

test('reference-faithful boards preserve the supplied visual system while replacing protected content', () => {
  const board = read('skills/buyna-website-design/references/design-system-board.md');

  for (const required of [
    /palette|color/i,
    /typography|font/i,
    /spacing|density/i,
    /component geometry|button.*card.*form/is,
    /section count|section order/i,
    /layout composition/i,
    /responsive/i,
  ]) assert.match(board, required);

  assert.match(board, /replace.*brand|brand.*replace/is);
  assert.match(board, /replace.*(?:text|copy)|(?:text|copy).*replace/is);
  assert.match(board, /three[- ]column.*CUSTOM_DIRECTION|CUSTOM_DIRECTION.*three[- ]column/is);
});

test('the board records and verifies reference fidelity before delivery', () => {
  const board = read('skills/buyna-website-design/references/design-system-board.md');
  const fields = read('skills/buyna-website-design/references/design-fields.md');

  assert.match(board, /compare.*reference|reference.*compare/is);
  assert.match(board, /regenerate once|regenerate.*one more time/i);
  assert.match(board, /palette.*typography.*density.*geometry.*layout/is);

  for (const label of [
    '设计板模式',
    '参考图输入方式',
    '参考图视觉映射',
    '参考图匹配检查',
  ]) assert.match(fields, new RegExp(label));
});
