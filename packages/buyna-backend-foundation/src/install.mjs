import {createHash,randomUUID} from 'node:crypto';
import {readFileSync,readdirSync,lstatSync,existsSync,mkdirSync,copyFileSync,writeFileSync,renameSync,rmSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';

function files(root,prefix='') {
  return readdirSync(join(root,prefix)).sort().flatMap(name=>{
    if(['node_modules','.git'].includes(name)) return [];
    const relative=join(prefix,name), stat=lstatSync(join(root,relative));
    if(stat.isSymbolicLink()) throw Error('BUNDLE_SYMLINK_NOT_ALLOWED');
    return stat.isDirectory()?files(root,relative):[relative.replaceAll('\\','/')];
  });
}
const hash=value=>createHash('sha256').update(value).digest('hex');

export function inspectBackendBundle(repositoryRoot) {
  const manifest=JSON.parse(readFileSync(join(repositoryRoot,'repository-manifest.json'),'utf8'));
  const packages=manifest.packages;
  if(!Array.isArray(packages)||!packages.includes('buyna-backend-foundation')) throw Error('BACKEND_MANIFEST_REQUIRED');
  const entries=[];
  for(const name of packages) {
    if(!/^buyna-[a-z0-9-]+$/.test(name)) throw Error('INVALID_PACKAGE_NAME');
    const root=join(repositoryRoot,'packages',name);
    if(!existsSync(join(root,'package.json'))) throw Error(`MISSING_FIXED_MODULE:${name}`);
    const pkg=JSON.parse(readFileSync(join(root,'package.json'),'utf8'));
    for(const file of files(root)) entries.push({path:`packages/${name}/${file}`,digest:hash(readFileSync(join(root,file)))});
    if(!pkg.version) throw Error(`PACKAGE_VERSION_REQUIRED:${name}`);
  }
  entries.sort((a,b)=>a.path.localeCompare(b.path,'en'));
  return {format:1,packages:[...packages],files:entries,digest:hash(JSON.stringify(entries))};
}

export function installBackendBundle({repositoryRoot,target}) {
  const root=resolve(repositoryRoot), destination=resolve(target), lock=inspectBackendBundle(root);
  if(existsSync(destination)) {
    const lockPath=join(destination,'backend.lock.json');
    if(!existsSync(lockPath)||JSON.parse(readFileSync(lockPath,'utf8')).digest!==lock.digest) throw Error('EXISTING_BACKEND_REQUIRES_REVIEWED_UPGRADE');
    for(const entry of lock.files) {
      if(!existsSync(join(destination,entry.path))||hash(readFileSync(join(destination,entry.path)))!==entry.digest) throw Error('INSTALLED_BACKEND_DRIFT');
    }
    return {installed:false,digest:lock.digest,target:destination};
  }
  mkdirSync(dirname(destination),{recursive:true});
  const staging=`${destination}.staging-${randomUUID()}`;
  mkdirSync(staging);
  try {
    for(const entry of lock.files) {
      const output=join(staging,entry.path);mkdirSync(dirname(output),{recursive:true});
      copyFileSync(join(root,entry.path),output);
      if(hash(readFileSync(output))!==entry.digest) throw Error('SOURCE_CHANGED_DURING_INSTALL');
    }
    writeFileSync(join(staging,'backend.lock.json'),JSON.stringify(lock,null,2)+'\n');
    renameSync(staging,destination);
    return {installed:true,digest:lock.digest,target:destination};
  } catch(error) {rmSync(staging,{recursive:true,force:true});throw error;}
}
