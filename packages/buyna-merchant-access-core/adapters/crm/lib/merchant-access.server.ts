import {DynamoDBClient} from '@aws-sdk/client-dynamodb';
import {DynamoDBDocumentClient,GetCommand,TransactWriteCommand} from '@aws-sdk/lib-dynamodb';
import {createHmac,timingSafeEqual} from 'node:crypto';
import {accessView,updateAccess} from './merchant-access-core.mjs';
const db=DynamoDBDocumentClient.from(new DynamoDBClient({region:process.env.AWS_REGION||'ap-northeast-1'}));
const table=()=>process.env.CRM_CUSTOMERS_TABLE||'buyna-admin-crm-customers';
const key=(id:string)=>`__merchant_access__#${id}`;
const project=(id:string)=>/^project-[a-f0-9-]{36}$/.test(id);
async function customer(id:string){const r=await db.send(new GetCommand({TableName:table(),Key:{id},ConsistentRead:true}));if(!r.Item||!['Basic','Pro'].includes(r.Item.plan))throw Error('CUSTOMER_NOT_FOUND');return r.Item;}
export async function readAccess(projectId:string,ownerActor?:string){
 if(!project(projectId))throw Error('INVALID_PROJECT');
 const r=await db.send(new GetCommand({TableName:table(),Key:{id:key(projectId)},ConsistentRead:true}));
 if(!r.Item||(ownerActor&&r.Item.ownerActor!==ownerActor))throw Error('ACCESS_NOT_FOUND');
 const c=await customer(r.Item.customerId);
 return {projectId,ownerActor:r.Item.ownerActor,customerId:c.id,company:c.company,...accessView(r.Item.access,c)};
}
export async function saveAccess(input:{projectId:string;ownerActor:string;customerId:string;expectedRevision:number;patch:Record<string,unknown>},actor:string,merchant=false){
 if(!project(input.projectId)||!input.ownerActor||input.ownerActor.length>128||!actor)throw Error('INVALID_BINDING');
 const c=await customer(input.customerId);
 const result=await db.send(new GetCommand({TableName:table(),Key:{id:key(input.projectId)},ConsistentRead:true}));
 const old=result.Item;
 if(old&&(old.ownerActor!==input.ownerActor||old.customerId!==input.customerId))throw Error('BINDING_CONFLICT');
 if(merchant&&!old)throw Error('ACCESS_NOT_FOUND');
 const access=updateAccess(old?.access,input.patch,{actor,expectedRevision:input.expectedRevision,merchant});
 const item={id:key(input.projectId),itemType:'merchant-access',projectId:input.projectId,ownerActor:input.ownerActor,customerId:input.customerId,access};
 await db.send(new TransactWriteCommand({TransactItems:[{Put:{TableName:table(),Item:item,ConditionExpression:old?'#a.#r = :r':'attribute_not_exists(id)',...(old?{ExpressionAttributeNames:{'#a':'access','#r':'revision'},ExpressionAttributeValues:{':r':input.expectedRevision}}:{})}},{Put:{TableName:table(),Item:{...item,id:`${key(input.projectId)}#audit#${access.revision}`,itemType:'merchant-access-audit'},ConditionExpression:'attribute_not_exists(id)'}}]}));
 return {projectId:input.projectId,ownerActor:input.ownerActor,customerId:input.customerId,company:c.company,...accessView(access,c)};
}
export function verifyAccessRequest(body:string,headers:Headers,now=Date.now()){
 const secret=process.env.BUILDER_CRM_ACCESS_SECRET;
 const time=headers.get('x-buyna-timestamp')||'',sig=headers.get('x-buyna-signature')||'';
 if(!secret||!/^\d{13}$/.test(time)||Math.abs(now-Number(time))>60000||!/^[a-f0-9]{64}$/.test(sig))return false;
 const expected=createHmac('sha256',secret).update(`merchant-access-v1\n${time}\n${body}`).digest();
 return timingSafeEqual(expected,Buffer.from(sig,'hex'));
}
