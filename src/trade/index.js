// Regional spot buyers: finite daily demand, real cargo and normal depot accounting.
import { getDate } from '../core/index.js';
import { quoteDelivery, sellLoad, hasTicket } from '../economy/index.js';
import { loadCarrier } from '../machinery/trailers.js';
import { pileTotal, takeProportional } from '../quarry/index.js';

export function tradeState(ctx) {
  return ctx.state.trade ??= { day:0, delivered:{}, lifetime:{}, history:[] };
}
export function buyerRelationship(ctx,id) {
  const tonnes=ctx.state.trade?.lifetime[id]??0;
  return [...ctx.data.trade.relationships].reverse().find(r=>tonnes>=r.tonnes);
}
export function buyerDemand(ctx,id,material,exceptMachine=null) {
  const cfg=ctx.data.trade.buyers[id]?.products[material];if(!cfg)return 0;
  const day=getDate(ctx.state,ctx.data).day,st=ctx.state.trade;
  const delivered=st?.day===day?st.delivered[id]?.[material]??0:0;
  const reserved=ctx.state.machines.reduce((t,m)=>t+(m.id!==exceptMachine&&m.job?.type==='tip'&&m.job.params.buyerId===id&&m.job.params.buyerMaterial===material?m.job.params.buyerTonnes??0:0),0);
  return Math.max(0,cfg.dailyTonnes-delivered-reserved);
}
export function quoteBuyerDelivery(ctx,id,load,exceptMachine=null,maxTonnes=Infinity) {
  const cfg=ctx.data.trade.buyers[id];
  if(!cfg)return {ok:false,reason:'Unknown delivery business'};
  const total=pileTotal(load);
  if(total<ctx.data.depot.minLoad)return {ok:false,reason:'Load material before planning a delivery'};
  const candidates=[];let suitable=false;
  for(const [material,p] of Object.entries(cfg.products)) {
    const purity=material===ctx.data.depot.mixedProduct?1:(load[material]??0)/total;
    if(purity+1e-9<cfg.minPurity)continue;
    suitable=true;
    const tonnes=Math.min(total,buyerDemand(ctx,id,material,exceptMachine),maxTonnes);
    if(tonnes<ctx.data.depot.minLoad)continue;
    const q=quoteDelivery(ctx,material,load,tonnes);
    const multiplier=p.multiplier*(1+buyerRelationship(ctx,id).bonus);
    candidates.push({...q,ok:true,buyerId:id,material,tonnes,multiplier,gross:q.gross*multiplier,perTonne:q.perTonne*multiplier,remaining:total-tonnes});
  }
  return candidates.sort((a,b)=>b.gross-a.gross)[0]??{ok:false,reason:suitable?'Daily demand filled; this business buys again tomorrow':`This business needs at least ${Math.round(cfg.minPurity*100)}% of an accepted material`};
}
export function deliverToBuyer(ctx,m,id,maxTonnes) {
  if(!hasTicket(ctx,m.id))return {ok:false,reason:'Load changed: weigh in again before selling'};
  const cargo=loadCarrier(ctx,m),q=quoteBuyerDelivery(ctx,id,cargo.load,m.id,maxTonnes);
  if(!q.ok)return q;
  const load=takeProportional(cargo.load,q.tonnes);
  const sale=sellLoad(ctx,m.id,q.material,load,{buyerId:id,priceMultiplier:q.multiplier});
  const st=tradeState(ctx),date=getDate(ctx.state,ctx.data);
  if(st.day!==date.day){st.day=date.day;st.delivered={};}
  const delivered=st.delivered[id]??={};delivered[q.material]=(delivered[q.material]??0)+q.tonnes;
  st.lifetime[id]=(st.lifetime[id]??0)+q.tonnes;
  st.history.push({buyerId:id,material:q.material,tonnes:q.tonnes,revenue:sale.revenue,...date});
  st.history.splice(0,Math.max(0,st.history.length-ctx.data.trade.historyLimit));
  ctx.events.emit('regionalDelivery',{buyerId:id,tonnes:q.tonnes,revenue:sale.revenue});
  return sale;
}
export function navigateBuyer(ctx,id) {
  if(id!==null&&!ctx.data.trade.buyers[id])return {ok:false,reason:'Unknown delivery business'};
  ctx.state.player.navigationBuyerId=id;
  ctx.state.player.navigationMachineId=null;
  ctx.state.player.navigationLandId=null;
  if(ctx.state.operations)ctx.state.operations.workAreaId=null;
  return {ok:true};
}
