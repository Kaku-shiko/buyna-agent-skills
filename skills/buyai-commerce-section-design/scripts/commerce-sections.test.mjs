import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { compileCommercePage, selectCommerceSectionItems, getCommerceSectionCatalog } from './commerce-sections.mjs';

const home = () => JSON.parse(readFileSync(new URL('../assets/commerce-home.example.json', import.meta.url), 'utf8'));
const grid = page => page.sections.find(s => s.id === 'new-products');

test('quantity and responsive columns vary independently without mutating input', () => {
  for (const count of [0, 1, 7, 17, 200, null]) {
    const input = home();
    grid(input).count = count;
    grid(input).columns = { mobile: 1 };
    const original = structuredClone(input);
    const output = compileCommercePage(input);
    assert.equal(grid(output).count, count);
    assert.deepEqual(grid(output).columns, { desktop: 4, tablet: 3, mobile: 1 });
    assert.deepEqual(input, original);
  }
});
test('selection never pads real data and distinguishes hidden from empty', () => {
  const section = grid(compileCommercePage(home()));
  const items = [{ id: 1 }, { id: 2 }, { id: 3 }];
  const selected = selectCommerceSectionItems({ ...section, count: 99 }, items);
  assert.deepEqual(selected.items, items);
  assert.notEqual(selected.items, items);
  assert.equal(selected.displayedCount, 3);
  assert.equal(selected.remainingLoadedCount, 0);
  assert.equal(selectCommerceSectionItems({ ...section, count: 1 }, items).remainingLoadedCount, 2);
  assert.equal(selectCommerceSectionItems({ ...section, count: null }, items).displayedCount, 3);
  assert.equal(selectCommerceSectionItems({ ...section, count: 0 }, items).state, 'hidden');
  assert.equal(selectCommerceSectionItems({ ...section, enabled: false }, items).state, 'hidden');
  assert.equal(selectCommerceSectionItems(section, []).state, 'empty');
  assert.equal(items.length, 3);
});
test('invalid or misspelled config is rejected rather than silently defaulted', () => {
  for (const value of [-1, 1.5, '8', undefined, Number.MAX_SAFE_INTEGER + 1]) {
    const page = home(); grid(page).count = value;
    assert.throws(() => compileCommercePage(page), /COUNT_INVALID/);
  }
  for (const columns of [{ mobile: 0 }, { desktop: 1.2 }, { phone: 2 }]) {
    const page = home(); grid(page).columns = columns;
    assert.throws(() => compileCommercePage(page), /INVALID/);
  }
  for (const patch of [{ enabled: 'false' }, { type: 'unknown' }, { layout: 'unknown' }, { coutn: 5 }]) {
    const page = home(); Object.assign(grid(page), patch);
    assert.throws(() => compileCommercePage(page), /INVALID/);
  }
});
test('repeated product modules retain independent IDs sources and order', () => {
  const result = compileCommercePage(home());
  const grids = result.sections.filter(s => s.type === 'product-grid');
  assert.deepEqual(grids.map(s => s.count), [8, 4]);
  assert.notEqual(grids[0].source, grids[1].source);
  const invalid = home(); invalid.sections.push({ ...invalid.sections[0] });
  assert.throws(() => compileCommercePage(invalid), /ID_DUPLICATE/);
  invalid.sections.at(-1).id = 'second-header';
  assert.throws(() => compileCommercePage(invalid), /SINGLETON_DUPLICATE/);
});
test('required sections cannot be disabled and home retains product discovery', () => {
  const page = home(); page.sections[0].enabled = false;
  assert.throws(() => compileCommercePage(page), /REQUIRED:navigation/);
  const minimal = { schemaVersion: 1, page: 'home', sections: [{ id: 'nav', type: 'navigation' }, { id: 'foot', type: 'footer' }] };
  assert.throws(() => compileCommercePage(minimal), /DISCOVERY_REQUIRED/);
  minimal.sections.splice(1, 0, { id: 'products', type: 'product-grid', count: 0 });
  assert.throws(() => compileCommercePage(minimal), /DISCOVERY_REQUIRED/);
  minimal.sections[1].count = 1;
  assert.equal(compileCommercePage(minimal).sections.length, 3);
});
test('transaction modules cannot trim ordered items or be placed on home', () => {
  const config = { schemaVersion: 1, page: 'cart', sections: [{ id: 'items', type: 'cart-items' }, { id: 'total', type: 'cart-summary' }] };
  assert.equal(compileCommercePage(config).sections.length, 2);
  config.sections[0].count = 1;
  assert.throws(() => compileCommercePage(config), /COUNT_NOT_APPLICABLE/);
  assert.throws(() => selectCommerceSectionItems({ type: 'cart-items', count: 1, enabled: true }, [1, 2]), /COLLECTION_REQUIRED/);
  const page = home(); page.sections.push({ id: 'pay', type: 'payment-methods' });
  assert.throws(() => compileCommercePage(page), /PAGE_MISMATCH/);
});
test('all page requirements compile and catalog copies cannot change defaults', () => {
  const catalog = getCommerceSectionCatalog();
  for (const page of catalog.pages) {
    const types = [...catalog.requiredByPage[page]];
    if (page === 'home') types.push('product-grid');
    assert.equal(compileCommercePage({ schemaVersion: 1, page, sections: types.map(type => ({ id: type, type })) }).page, page);
  }
  catalog.sections['product-grid'].defaultCount = -100;
  const page = home(); delete grid(page).count;
  assert.equal(grid(compileCommercePage(page)).count, 8);
});
test('three example combinations differ in composition and all retain essentials', () => {
  const examples = JSON.parse(readFileSync(new URL('../assets/commerce-combinations.example.json', import.meta.url), 'utf8'));
  const signatures = examples.variants.map(v => {
    const page = compileCommercePage(v.pageConfig);
    return page.sections.map(s => `${s.type}:${s.layout}`).join('|');
  });
  assert.equal(new Set(signatures).size, 3);
});
test('installed Skill has a self-contained executable module and asset catalog', t => {
  const dir = mkdtempSync(join(tmpdir(), 'buyna-sections-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  cpSync(fileURLToPath(new URL('../', import.meta.url)), join(dir, 'skill'), { recursive: true });
  const result = spawnSync(process.execPath, [join(dir, 'skill/scripts/commerce-sections.mjs'), '--input', join(dir, 'skill/assets/commerce-home.example.json')], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).sections.find(s => s.id === 'new-products').count, 8);
});
