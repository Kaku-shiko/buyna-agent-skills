import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const packageName = '@buyna/service-subscription-core';
const validVersion = value => /^\d+\.\d+\.\d+$/.test(value);
const safeFile = value => /^(package\.json|README\.md|INTEGRATION\.md|src\/server-proxy\.ts|src\/[a-z0-9.-]+\.mjs|ui\/[a-zA-Z0-9.-]+\.(jsx|mjs|css))$/.test(value) && !value.includes('..') && !value.includes('.test.');
function ensure(value, message) { if (!value) throw Error(message); }

export function buildBundle(root) {
  const pkg = JSON.parse(fs.readFileSync(path.join(root,'package.json')));
  ensure(pkg.name === packageName && validVersion(pkg.version),'INVALID_PACKAGE');
  const names = ['package.json','README.md','INTEGRATION.md', ...['src','ui'].flatMap(dir => fs.readdirSync(path.join(root,dir)).map(file=>`${dir}/${file}`))].filter(safeFile).sort();
  const files = names.map(name => {
    const file = path.join(root,name);
    ensure(fs.lstatSync(file).isFile() && !fs.lstatSync(file).isSymbolicLink(),'INVALID_SOURCE_FILE');
    const content = fs.readFileSync(file,'utf8');
    ensure(!/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|AKIA[0-9A-Z]{16}/.test(content),'SECRET_PATTERN');
    return {path:name,content,sha256:sha256(content)};
  });
  return {schema:1,name:packageName,version:pkg.version,files};
}

export function validateBundle(bytes, digest) {
  ensure(/^[a-f0-9]{64}$/.test(digest) && sha256(bytes) === digest,'PACKAGE_DIGEST_MISMATCH');
  ensure(bytes.length < 4*1024*1024,'PACKAGE_TOO_LARGE');
  const bundle = JSON.parse(bytes.toString());
  ensure(bundle.schema === 1 && bundle.name === packageName && validVersion(bundle.version) && Array.isArray(bundle.files),'INVALID_BUNDLE');
  const seen = new Set();
  for (const file of bundle.files) {
    ensure(safeFile(file.path) && !seen.has(file.path) && typeof file.content === 'string','UNSAFE_PACKAGE_FILE');
    seen.add(file.path); ensure(sha256(file.content) === file.sha256,'FILE_DIGEST_MISMATCH');
  }
  for(const required of ['package.json','src/integration.mjs','ui/SubscriptionPanel.jsx','ui/SubscriptionReminder.jsx']) ensure(seen.has(required),'INCOMPLETE_PACKAGE');
  const pkg = JSON.parse(bundle.files.find(file=>file.path === 'package.json').content);
  ensure(pkg.name === packageName && pkg.version === bundle.version && !pkg.scripts?.preinstall && !pkg.scripts?.postinstall && !pkg.scripts?.install,'INVALID_PACKAGE_METADATA');
  return bundle;
}

function assertPlainDirectory(target) {
  const resolved = path.resolve(target);
  for(let current=resolved;;current=path.dirname(current)) {
    if(fs.existsSync(current)) ensure(fs.lstatSync(current).isDirectory() && !fs.lstatSync(current).isSymbolicLink(),'UNSAFE_DIRECTORY');
    if(path.dirname(current)===current)break;
  }
  return resolved;
}

export function installBundle(bytes, digest, project, source) {
  const bundle = validateBundle(bytes,digest);
  project = assertPlainDirectory(project);
  ensure(fs.existsSync(project),'PROJECT_REQUIRED');
  const relative = `.buyna/subscription/${bundle.version}`;
  const destination = assertPlainDirectory(path.join(project,relative));
  if(fs.existsSync(destination)) {
    for(const file of bundle.files) ensure(fs.existsSync(path.join(destination,file.path)) && !fs.lstatSync(path.join(destination,file.path)).isSymbolicLink() && sha256(fs.readFileSync(path.join(destination,file.path)))===file.sha256,'INSTALLED_VERSION_CONFLICT');
  } else {
    const staging = `${destination}.staging-${process.pid}`;
    fs.mkdirSync(staging,{recursive:true});
    for(const file of bundle.files) {
      const target = path.join(staging,file.path); fs.mkdirSync(path.dirname(target),{recursive:true}); fs.writeFileSync(target,file.content,{flag:'wx'});
    }
    fs.renameSync(staging,destination);
  }
  const lockPath = path.join(project,'subscription-package.lock.json');
  if(fs.existsSync(lockPath))ensure(!fs.lstatSync(lockPath).isSymbolicLink(),'UNSAFE_LOCK');
  const previous = fs.existsSync(lockPath)?JSON.parse(fs.readFileSync(lockPath)):null;
  const lock = {schema:1,name:packageName,version:bundle.version,sha256:digest,path:relative,source,files:Object.fromEntries(bundle.files.map(file=>[file.path,file.sha256])),previous:previous?.sha256===digest?previous.previous:previous};
  const temporary = `${lockPath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary,JSON.stringify(lock,null,2),{flag:'wx'}); fs.renameSync(temporary,lockPath);
  return lock;
}

export function verifyInstalled(project, lock) {
  ensure(lock?.name === packageName && validVersion(lock.version) && lock.path===`.buyna/subscription/${lock.version}`,'INVALID_LOCK');
  const root = assertPlainDirectory(path.join(project,lock.path));
  for(const [name,digest] of Object.entries(lock.files)) {
    ensure(safeFile(name),'INVALID_LOCK_FILE');
    const file = path.join(root,name);
    assertPlainDirectory(path.dirname(file));
    ensure(fs.lstatSync(file).isFile() && !fs.lstatSync(file).isSymbolicLink() && sha256(fs.readFileSync(file))===digest,'INSTALLED_DIGEST_MISMATCH');
  }
  ensure(sha256(Buffer.from(JSON.stringify(buildBundle(root))))===lock.sha256,'INSTALLED_BUNDLE_MISMATCH');
  return root;
}

export function rollbackInstalled(project) {
  project=assertPlainDirectory(project);
  const lockPath=path.join(project,'subscription-package.lock.json');
  ensure(!fs.lstatSync(lockPath).isSymbolicLink(),'UNSAFE_LOCK');
  const lock=JSON.parse(fs.readFileSync(lockPath)); ensure(lock.previous,'NO_PREVIOUS_VERSION');
  verifyInstalled(project,lock.previous);
  const temp=`${lockPath}.${process.pid}.tmp`;
  fs.writeFileSync(temp,JSON.stringify(lock.previous,null,2),{flag:'wx'}); fs.renameSync(temp,lockPath);
  return lock.previous;
}

function aws(args) {
  const result = spawnSync('aws',[...args,'--profile',process.env.AWS_PROFILE||'codex-deploy','--region','ap-northeast-1','--no-cli-pager','--output','json'],{encoding:'utf8',maxBuffer:8*1024*1024});
  ensure(result.status===0,`AWS_${args[0]}_${args[1]}_FAILED`);
  return result.stdout.trim()?JSON.parse(result.stdout):{};
}

async function main() {
  const [command,...args] = process.argv.slice(2);
  if(command==='pack') {
    const [root,out] = args; ensure(root&&out,'ROOT_AND_OUTPUT_REQUIRED');
    const bytes = Buffer.from(JSON.stringify(buildBundle(root))); validateBundle(bytes,sha256(bytes));
    fs.writeFileSync(out,bytes,{flag:'wx'}); console.log(JSON.stringify({path:out,sha256:sha256(bytes),bytes:bytes.length}));
  } else if(command==='publish') {
    const [file,digest,bucket,key] = args; const bytes=fs.readFileSync(file); const bundle=validateBundle(bytes,digest);
    ensure(bucket==='buyna-s3' && key===`shared-modules/service-subscription/${bundle.version}/bundle.json`,'UNAPPROVED_STORAGE_TARGET');
    ensure(aws(['sts','get-caller-identity']).Account==='508888023661','WRONG_AWS_ACCOUNT');
    const privacy=aws(['s3api','get-public-access-block','--bucket',bucket]).PublicAccessBlockConfiguration;
    ensure(['BlockPublicAcls','IgnorePublicAcls','BlockPublicPolicy','RestrictPublicBuckets'].every(key=>privacy[key]===true),'PRIVATE_BUCKET_REQUIRED');
    const result=aws(['s3api','put-object','--bucket',bucket,'--key',key,'--body',file,'--server-side-encryption','AES256','--if-none-match','*','--metadata',`sha256=${digest}`]);
    console.log(JSON.stringify({published:true,version:bundle.version,sha256:digest,uri:`s3://${bucket}/${key}`,etag:result.ETag}));
  } else if(command==='install') {
    const [uri,digest,project] = args; const match=/^s3:\/\/([a-z0-9-]+)\/(.+)$/.exec(uri||''); ensure(match,'S3_URI_REQUIRED');
    assertPlainDirectory(project); ensure(fs.existsSync(project),'PROJECT_REQUIRED');
    const temp=path.join(project,`.subscription-download-${process.pid}.json`); ensure(!fs.existsSync(temp),'DOWNLOAD_ALREADY_EXISTS');
    try { aws(['s3api','get-object','--bucket',match[1],'--key',match[2],temp]); const lock=installBundle(fs.readFileSync(temp),digest,project,uri); verifyInstalled(project,lock); console.log(JSON.stringify({installed:true,version:lock.version,sha256:lock.sha256})); }
    finally {if(fs.existsSync(temp))fs.unlinkSync(temp);}
  } else if(command==='verify') {
    const [project]=args; const lock=JSON.parse(fs.readFileSync(path.join(project,'subscription-package.lock.json'))); console.log(JSON.stringify({verified:true,path:verifyInstalled(project,lock),version:lock.version}));
  } else if(command==='rollback') {
    const previous=rollbackInstalled(args[0]); console.log(JSON.stringify({rolledBack:true,version:previous.version,requiresRebuild:true,deployed:false}));
  } else throw Error('COMMAND_REQUIRED: pack | publish | install | verify | rollback');
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error.message);process.exitCode=1;});
