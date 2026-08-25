const closeActions=new Set(['backdrop','navigate','escape','close']);

export function dashboardDrawerReducer(open,action={}){
  if(action.type==='toggle')return !open;
  if(action.type==='open')return true;
  if(closeActions.has(action.type))return false;
  return Boolean(open);
}
