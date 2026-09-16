import {createFileRoute} from '@tanstack/react-router';
export const Route=createFileRoute('/api/internal/merchant-access')({server:{handlers:{POST:async({request})=>{
 const headers={'cache-control':'no-store'};
 const body=await request.text();if(body.length>12000)return Response.json({error:'INVALID_REQUEST'},{status:400,headers});
 const {verifyAccessRequest,readAccess,saveAccess}=await import('@/lib/merchant-access.server');
 if(!verifyAccessRequest(body,request.headers))return Response.json({error:'UNAUTHORIZED'},{status:401,headers});
 try{const input=JSON.parse(body);if(typeof input.ownerActor!=='string'||!input.ownerActor)return Response.json({error:'UNAUTHORIZED'},{status:401,headers});
 const current=await readAccess(input.projectId,input.ownerActor);
 if(input.action==='read')return Response.json({access:current},{headers});
 if(input.action!=='profile')throw Error('INVALID_ACTION');
 const access=await saveAccess({projectId:input.projectId,ownerActor:input.ownerActor,customerId:current.customerId,expectedRevision:input.expectedRevision,patch:input.patch},input.ownerActor,true);
 return Response.json({access},{headers});
 }catch(e){const message=(e as Error).message;const conflict=message==='REVISION_CONFLICT'||(e as Error).name==='TransactionCanceledException';return Response.json({error:conflict?'REVISION_CONFLICT':'ACCESS_NOT_FOUND_OR_INVALID'},{status:conflict?409:404,headers});}
}}}});
