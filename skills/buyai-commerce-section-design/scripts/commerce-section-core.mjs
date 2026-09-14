import catalog from '../assets/commerce-section-catalog.json' with { type: 'json' };

const own = (value, key) => Object.hasOwn(value, key);
const fail = code => { throw new Error(code); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function keys(value, allowed) {
  if (!object(value) || Object.keys(value).some(key => !allowed.includes(key))) fail('SECTION_CONFIG_INVALID');
}
function text(value, code) {
  if (typeof value !== 'string' || !value.trim()) fail(code);
  return value.trim();
}
function count(value) {
  if (value !== null && (!Number.isSafeInteger(value) || value < 0)) fail('SECTION_COUNT_INVALID');
  return value;
}
export function getCommerceSectionCatalog() { return structuredClone(catalog); }

/** Presentation configuration only: does not grant business capabilities or load data. */
export function compileCommercePage(config) {
  keys(config, ['schemaVersion', 'page', 'sections']);
  if (config.schemaVersion !== 1) fail('SECTION_SCHEMA_VERSION_INVALID');
  if (!catalog.pages.includes(config.page)) fail('SECTION_PAGE_INVALID');
  if (!Array.isArray(config.sections)) fail('SECTIONS_REQUIRED');
  const ids = new Set();
  const singletons = new Set();
  const sections = config.sections.map(input => {
    keys(input, ['id', 'type', 'enabled', 'title', 'source', 'count', 'columns', 'layout']);
    const id = text(input.id, 'SECTION_ID_REQUIRED');
    if (ids.has(id)) fail('SECTION_ID_DUPLICATE');
    ids.add(id);
    const definition = own(catalog.sections, input.type) && catalog.sections[input.type];
    if (!definition) fail('SECTION_TYPE_INVALID');
    if (!definition.pages.includes('*') && !definition.pages.includes(config.page)) fail('SECTION_PAGE_MISMATCH');
    const enabled = own(input, 'enabled') ? input.enabled : true;
    if (typeof enabled !== 'boolean') fail('SECTION_ENABLED_INVALID');
    if (definition.kind !== 'collection' && enabled) {
      if (singletons.has(input.type)) fail('SECTION_SINGLETON_DUPLICATE');
      singletons.add(input.type);
    }
    const layout = own(input, 'layout') ? input.layout : definition.defaultLayout;
    if (!definition.layouts.includes(layout)) fail('SECTION_LAYOUT_INVALID');
    const result = { id, type: input.type, enabled, layout };
    for (const field of ['title', 'source']) if (own(input, field)) result[field] = text(input[field], 'SECTION_TEXT_INVALID');
    if (definition.kind === 'collection') {
      result.count = count(own(input, 'count') ? input.count : definition.defaultCount);
      const columns = { ...definition.defaultColumns };
      if (own(input, 'columns')) {
        keys(input.columns, ['desktop', 'tablet', 'mobile']);
        for (const [viewport, value] of Object.entries(input.columns)) {
          if (!Number.isSafeInteger(value) || value < 1) fail('SECTION_COLUMNS_INVALID');
          columns[viewport] = value;
        }
      }
      result.columns = columns;
    } else if (own(input, 'count') || own(input, 'columns')) fail('SECTION_COUNT_NOT_APPLICABLE');
    return result;
  });
  const active = new Set(sections.filter(s => s.enabled && s.count !== 0).map(s => s.type));
  for (const type of catalog.requiredByPage[config.page] ?? []) {
    if (!active.has(type)) fail(`SECTION_REQUIRED:${type}`);
  }
  for (const alternatives of catalog.oneOfByPage[config.page] ?? []) {
    if (!alternatives.some(type => active.has(type))) fail(`SECTION_DISCOVERY_REQUIRED:${alternatives.join('|')}`);
  }
  return { schemaVersion: 1, page: config.page, sections };
}

/** Limits only a collection's already authorized, ordered data. Never pads or fabricates items. */
export function selectCommerceSectionItems(section, items) {
  const definition = object(section) && own(catalog.sections, section.type) && catalog.sections[section.type];
  if (!definition || definition.kind !== 'collection') fail('SECTION_COLLECTION_REQUIRED');
  if (!Array.isArray(items)) fail('SECTION_ITEMS_REQUIRED');
  if (typeof section.enabled !== 'boolean') fail('SECTION_ENABLED_INVALID');
  const limit = count(section.count);
  const hidden = !section.enabled || limit === 0;
  const visible = hidden ? [] : items.slice(0, limit === null ? items.length : limit);
  return {
    items: visible,
    state: hidden ? 'hidden' : visible.length ? 'ready' : 'empty',
    displayedCount: visible.length,
    availableLoadedCount: items.length,
    remainingLoadedCount: items.length - visible.length,
  };
}

