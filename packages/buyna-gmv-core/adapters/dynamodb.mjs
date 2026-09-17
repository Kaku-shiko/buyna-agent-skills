import {createHash} from 'node:crypto';
import {createGmvLedger} from '../src/ledger.mjs';

// Inject SDK command constructors so the fixed core has no AWS SDK dependency.
export function createDynamoGmvLedger({client,tableName,GetCommand,ScanCommand,TransactWriteCommand}){
 const key=event=>'gmv#order-ledger#'+createHash('sha256').update(JSON.stringify([event.projectId,event.sellerId,event.orderId])).digest('hex');
 const get=async id=>(await client.send(new GetCommand({TableName:tableName(),Key:{id},ConsistentRead:true}))).Item;
 return createGmvLedger({store:{
  getEvent:get,
  getOrderLedger:event=>get(key(event)),
  async listLegacyOrderEvents(event){
   // An exclusion means the old writer deleted history. Do not invent a capture.
   if(await get(`gmv#excluded#${event.sellerId}#${event.orderId}`))throw new Error('GMV_LEGACY_RECONCILIATION_REQUIRED');
   const items=[];let cursor;
   do{const result=await client.send(new ScanCommand({TableName:tableName(),ConsistentRead:true,FilterExpression:'itemType = :type AND projectId = :project AND sellerId = :seller AND orderId = :order',ExpressionAttributeValues:{':type':'gmv-event',':project':event.projectId,':seller':event.sellerId,':order':event.orderId},ExclusiveStartKey:cursor}));items.push(...result.Items??[]);cursor=result.LastEvaluatedKey;}while(cursor);
   return items;
  },
  async commit({id,event,previous,next}){
   try{await client.send(new TransactWriteCommand({TransactItems:[
    {Put:{TableName:tableName(),Item:{id,itemType:'gmv-event',...event,createdAt:new Date().toISOString()},ConditionExpression:'attribute_not_exists(id)'}},
    {Put:{TableName:tableName(),Item:{id:key(event),itemType:'gmv-order-ledger',...next},ConditionExpression:previous?'#revision = :expected':'attribute_not_exists(id)',...(previous?{ExpressionAttributeNames:{'#revision':'revision'},ExpressionAttributeValues:{':expected':previous.revision}}:{})}},
   ]}));return true;}catch(error){if(error.name==='TransactionCanceledException'&&error.CancellationReasons?.some(r=>r.Code==='ConditionalCheckFailed')&&error.CancellationReasons.every(r=>['None','ConditionalCheckFailed'].includes(r.Code)))return false;throw error;}
  },
 }});
}
