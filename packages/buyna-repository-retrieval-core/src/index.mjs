import {readFile,readdir,lstat,realpath} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const digest=s=>createHash('sha256').update(s).digest('hex');
function tokens(s){const text=s.toLowerCase();const result=text.match(/[a-z0-9_]+/g)||[];for(const part of text.match(/[\u3400-\u9fff]+/g)||[])for(let i=0;i<part.length-1;i++)result.push(part.slice(i,i+2));return [...new Set(result)];}
const inside=(root,p)=>{const r=path.relative(root,p);return !path.isAbsolute(r)&&r!=='..'&&!r.startsWith('..'+path.sep);};
export async function buildRepositoryIndex(root){
 root=await realpath(root);const manifest=JSON.parse(await readFile(path.join(root,'repository-manifest.json'),'utf8'));
 const chunks=[];
 async function walk(dir,skill){for(const entry of (await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
  const p=path.join(dir,entry.name);if(entry.isSymbolicLink())continue;
  if(entry.isDirectory()){if(entry.name==='references')await walk(p,skill);continue;}
  if(!entry.isFile()||!entry.name.endsWith('.md'))continue;
  const r=await realpath(p);if(!inside(root,r)||(await lstat(p)).size>256000)continue;
  const text=await readFile(r,'utf8'),lines=text.split('\n'),source=path.relative(root,r).replaceAll('\\','/'),hash=digest(text);
  const metadata=manifest.knowledgeTags?.[skill]??{};
  for(let start=0;start<lines.length;){let end=start+1;while(end<lines.length&&end-start<65&&!/^#{1,3} /.test(lines[end]))end++;const content=lines.slice(start,end).join('\n');if(content.trim())chunks.push({skill,source,startLine:start+1,endLine:end,hash,content,metadata});start=end;}
 }}
 for(const skill of manifest.skills){if(!/^[a-z0-9-]+$/.test(skill)||manifest.obsoleteSkills?.includes(skill))continue;const base=path.join(root,'skills',skill);if((await lstat(base)).isSymbolicLink())continue;await walk(base,skill);}
 return {schemaVersion:1,indexDigest:digest(JSON.stringify(chunks)),chunks};
}
export function searchRepository(index,query,{skills,limit=5,maxChars=9000,filters={}}={}){
 const terms=tokens(query);if(!terms.length)return [];
 const aliases=[[/图片|文件|上传|存储/,['image','storage','s3']],[/配额|容量|500m|2g/i,['quota','storage']],[/支付|付款|渠道|凭证/,['globepay','payment']],[/退款/,['refund','settlement']],[/预约|时段|冲突/,['booking']],[/订阅|套餐|开通情况/,['subscription','merchant-access']],[/轮播|横幅|banner/i,['banner']],[/组件|模组|shadcn|registry/i,['component','registry']],[/术语|单选|多选|弹窗|抽屉/,['terminology','dialog','drawer','radiogroup','checkbox']],[/手机|移动端|响应式/,['responsive','mobile']]];
 for(const [pattern,extra] of aliases)if(pattern.test(query))terms.push(...extra);
 const eligible=index.chunks.filter(c=>(!skills||skills.includes(c.skill))&&Object.entries(filters).every(([key,value])=>Array.isArray(c.metadata?.[key])&&c.metadata[key].includes(value)));
 // Local sparse TF-IDF cosine retrieval complements keyword matches. This is
 // not a hosted embedding model and sends no merchant data to another service.
 const vectors=eligible.map(c=>new Set(tokens(c.content+' '+c.source))),frequency=new Map();
 for(const vector of vectors)for(const term of vector)frequency.set(term,(frequency.get(term)||0)+1);
 const weight=term=>Math.log(1+eligible.length/(1+(frequency.get(term)||0)));
 const queryVector=new Set(terms),queryNorm=Math.sqrt([...queryVector].reduce((sum,t)=>sum+weight(t)**2,0));
 const ranked=eligible.map((c,i)=>{
  const body=c.content.toLowerCase(),name=(c.skill+' '+c.source).toLowerCase();
  const vector=vectors[i],norm=Math.sqrt([...vector].reduce((sum,t)=>sum+weight(t)**2,0));
  const cosine=[...queryVector].reduce((sum,t)=>sum+(vector.has(t)?weight(t)**2:0),0)/(queryNorm*norm||1);
  return {...c,score:terms.reduce((sum,t)=>sum+(body.includes(t)?1:0)+(name.includes(t)?3:0),0)+10*cosine};
 }).filter(c=>c.score>0).sort((a,b)=>b.score-a.score||a.source.localeCompare(b.source)||a.startLine-b.startLine);
 const result=[];let chars=0;for(const c of ranked){if(result.length>=limit)break;if(chars+c.content.length>maxChars)continue;result.push(c);chars+=c.content.length;}return result;
}
