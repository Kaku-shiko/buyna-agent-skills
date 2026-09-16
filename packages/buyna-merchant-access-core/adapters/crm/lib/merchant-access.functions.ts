import {createServerFn} from '@tanstack/react-start';
import {z} from 'zod';
const binding=z.object({projectId:z.string().regex(/^project-[a-f0-9-]{36}$/),ownerActor:z.string().min(1).max(128),customerId:z.string().min(1).max(120),expectedRevision:z.number().int().nonnegative(),patch:z.record(z.unknown())}).strict();
async function admin(){const {readAdminSession}=await import('./admin-auth.server');const s=readAdminSession();if(!s?.username)throw Error('UNAUTHORIZED');return s.username;}
export const getMerchantAccess=createServerFn({method:'POST'}).validator((v)=>z.object({projectId:z.string()}).parse(v)).handler(async({data})=>{await admin();const {readAccess}=await import('./merchant-access.server');return readAccess(data.projectId);});
export const saveMerchantAccess=createServerFn({method:'POST'}).validator(v=>binding.parse(v)).handler(async({data})=>{const actor=await admin();const {saveAccess}=await import('./merchant-access.server');return saveAccess(data,actor);});
