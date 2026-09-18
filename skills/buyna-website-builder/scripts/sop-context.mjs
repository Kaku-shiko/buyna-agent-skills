import { existsSync, readFileSync, readdirSync, lstatSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
const fail = code => { throw new Error(code); };
const sha = value => createHash('sha256').update(value).digest('hex');
const parse = path => JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
const digestPattern = /^[a-f0-9]{64}$/;
const safeFile = value => typeof value === 'string' && /^[a-z0-9][a-z0-9./-]*\.(md|json)$/.test(value) && !value.split('/').includes('..');
function atomicJson(path, value) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
  renameSync(temporary, path);
}
export function loadSopBundle(sourceRoot) {
  if (!lstatSync(sourceRoot).isDirectory() || lstatSync(sourceRoot).isSymbolicLink()) fail('SOP_DIRECTORY_REQUIRED');
  const files = {};
  function walk(directory, prefix = '') {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
      const name = prefix + entry.name;
      if (entry.isSymbolicLink()) fail('SOP_SYMLINK_UNSUPPORTED');
      if (entry.isDirectory()) walk(join(directory, entry.name), name + '/');
      else if (entry.isFile() && name !== 'bundle.json') {
        if (!safeFile(name)) fail('SOP_FILE_INVALID');
        files[name] = sha(readFileSync(join(sourceRoot, name)));
      }
    }
  }
  walk(sourceRoot);
  const manifest = parse(join(sourceRoot, 'manifest.json'));
  if (!/^\d+\.\d+\.\d+$/.test(manifest.version) || !Array.isArray(manifest.shared) || !manifest.sops || !Object.keys(manifest.sops).length) fail('SOP_MANIFEST_INVALID');
  for (const file of [...manifest.shared, ...Object.values(manifest.sops)]) if (!safeFile(file) || !Object.hasOwn(files, file)) fail('SOP_MANIFEST_INVALID');
  const digest = sha(JSON.stringify(Object.entries(files).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))));
  return { sourceRoot: resolve(sourceRoot), manifest, files, digest, version: manifest.version };
}
export function installSopBundle({ sourceRoot, destinationRoot, sourceRevision = null }) {
  if (sourceRevision !== null && !/^[a-f0-9]{40}$/.test(sourceRevision)) fail('SOP_SOURCE_REVISION_INVALID');
  const source = loadSopBundle(sourceRoot);
  const root = join(destinationRoot, 'sop', source.digest);
  if (existsSync(root)) {
    if (loadSopBundle(root).digest !== source.digest) fail('SOP_INTEGRITY_MISMATCH');
  } else {
    mkdirSync(root, { recursive: true });
    for (const file of Object.keys(source.files)) {
      const target = join(root, file);
      mkdirSync(resolve(target, '..'), { recursive: true });
      writeFileSync(target, readFileSync(join(sourceRoot, file)), { flag: 'wx' });
    }
    if (loadSopBundle(root).digest !== source.digest) fail('SOP_INTEGRITY_MISMATCH');
    atomicJson(join(root, 'bundle.json'), { version: source.version, digest: source.digest, sourceRevision });
  }
  const receipt = parse(join(root, 'bundle.json'));
  atomicJson(join(destinationRoot, 'sop-installation.json'), receipt);
  return receipt;
}
export function resolveSopContext({ installationRoot, digest, sopIds = ['website-delivery'] }) {
  if (digest !== undefined && !digestPattern.test(digest)) fail('SOP_PIN_INVALID');
  const receipt = digest ? parse(join(installationRoot, 'sop', digest, 'bundle.json')) : parse(join(installationRoot, 'sop-installation.json'));
  if (!digestPattern.test(receipt.digest) || (digest && receipt.digest !== digest) || (receipt.sourceRevision !== null && !/^[a-f0-9]{40}$/.test(receipt.sourceRevision))) fail('SOP_PIN_INVALID');
  const bundle = loadSopBundle(join(installationRoot, 'sop', receipt.digest));
  if (bundle.digest !== receipt.digest || bundle.version !== receipt.version) fail('SOP_INTEGRITY_MISMATCH');
  if (!Array.isArray(sopIds) || !sopIds.length || new Set(sopIds).size !== sopIds.length || sopIds.some(id => typeof id !== 'string' || !Object.hasOwn(bundle.manifest.sops, id))) fail('SOP_SELECTION_INVALID');
  return { ...bundle, sourceRevision: receipt.sourceRevision, sopIds, selected: sopIds.map(id => bundle.manifest.sops[id]) };
}
export function localSopSource() {
  const repositorySop = fileURLToPath(new URL('../../../sop', import.meta.url));
  if (existsSync(join(repositorySop, 'manifest.json'))) return { ...loadSopBundle(repositorySop), sourceRevision: null };
  const installationRoot = fileURLToPath(new URL('../../../buyna', import.meta.url));
  if (existsSync(join(installationRoot, 'sop-installation.json'))) return resolveSopContext({ installationRoot });
  const mirroredSource = fileURLToPath(new URL('../../../../sop', import.meta.url));
  if (existsSync(join(mirroredSource, 'manifest.json'))) return { ...loadSopBundle(mirroredSource), sourceRevision: null };
  fail('SOP_INSTALLATION_REQUIRED');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [sourceRoot, destinationRoot, sourceRevision] = process.argv.slice(2);
  if (!sourceRoot || !destinationRoot) fail('USAGE: <source-sop-root> <installation-namespace> [source-revision]');
  console.log(JSON.stringify(installSopBundle({ sourceRoot, destinationRoot, sourceRevision: sourceRevision || null })));
}
