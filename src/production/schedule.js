// Finite saved orders; waiting work owns neither material, bay space nor money.
import { ownsBuilding } from '../buildings/index.js';
import { productionState, validateProductionPlan, quoteProduction, startProduction } from './index.js';

export function productionQueue(ctx,plantId) {
  return ctx.state.production?.schedules?.[ctx.state.currentSiteId]?.[plantId]??{paused:false,entries:[]};
}
function mutable(ctx,plantId) {
  const st=productionState(ctx);
  return (st.schedules[ctx.state.currentSiteId]??={})[plantId]??={paused:false,entries:[]};
}
export function queueProduction(ctx,request,{batches=1}={}) {
  const valid=validateProductionPlan(ctx,request);if(!valid.ok)return valid;
  const {plantId}=valid.request,cfg=ctx.data.production;
  if(!ownsBuilding(ctx,'stockpiles')||!ownsBuilding(ctx,cfg.plants[plantId].building))return {ok:false,reason:'Commission stockpile bays and this plant first'};
  if(!Number.isInteger(batches)||batches<1||batches>cfg.queue.maximumBatches)return {ok:false,reason:`Choose 1–${cfg.queue.maximumBatches} whole batches`};
  if(productionQueue(ctx,plantId).entries.length>=cfg.queue.maximumEntries)return {ok:false,reason:'This plant’s queue is full'};
  const st=productionState(ctx),queue=mutable(ctx,plantId);
  const entry={id:`order-${st.nextQueueId++}`,request:valid.request,remaining:batches,total:batches};
  queue.entries.push(entry);
  return {ok:true,id:entry.id};
}
export function pauseProductionQueue(ctx,plantId,paused) {
  if(!ctx.data.production.plants[plantId]||typeof paused!=='boolean')return {ok:false,reason:'Choose a plant and pause state'};
  // Cancellation must not create an empty queue in otherwise unchanged legacy saves.
  const q=ctx.state.production?.schedules?.[ctx.state.currentSiteId]?.[plantId];
  if(q)q.paused=paused;
  return {ok:true};
}
export function removeQueuedProduction(ctx,plantId,id) {
  const q=productionQueue(ctx,plantId),at=q.entries.findIndex(e=>e.id===id);
  if(at<0)return {ok:false,reason:'This queued order no longer exists'};
  q.entries.splice(at,1);return {ok:true};
}
export function moveQueuedProduction(ctx,plantId,id,direction) {
  const q=productionQueue(ctx,plantId),at=q.entries.findIndex(e=>e.id===id),to=at+direction;
  if(![-1,1].includes(direction)||at<0||to<0||to>=q.entries.length)return {ok:false,reason:'This order cannot move further'};
  [q.entries[at],q.entries[to]]=[q.entries[to],q.entries[at]];return {ok:true};
}
export function setProductionCashReserve(ctx,amount) {
  if(!Number.isFinite(amount)||amount<0)return {ok:false,reason:'Choose a non-negative cash reserve'};
  productionState(ctx).cashReserve=Math.round(amount*100)/100;return {ok:true};
}
export function productionQueueStatus(ctx,plantId) {
  const q=productionQueue(ctx,plantId),running=ctx.state.production?.jobs?.find(j=>j.plantId===plantId&&j.siteId===ctx.state.currentSiteId);
  if(q.paused)return {state:'paused',reason:running?'Paused after the current batch':'Queue paused'};
  if(running)return {state:'running',reason:'Batch running; queued work follows when the plant is free'};
  if(!q.entries.length)return {state:'idle',reason:'No queued orders'};
  const quote=quoteProduction(ctx,q.entries[0].request);
  if(!quote.ok)return {state:'waiting',reason:quote.reason};
  const reserve=ctx.state.production.cashReserve??ctx.data.production.queue.defaultCashReserve;
  if(ctx.state.money-quote.cost<reserve-1e-8)return {state:'waiting',reason:`Waiting to keep $${reserve.toFixed(2)} in the bank`};
  return {state:'ready',reason:'Ready: starts when game time advances',quote};
}
export function tickProductionQueue(ctx) {
  for(const plantId of Object.keys(ctx.data.production.plants)) {
    if(productionQueueStatus(ctx,plantId).state!=='ready')continue;
    const q=productionQueue(ctx,plantId),entry=q.entries[0];
    const result=startProduction(ctx,entry.request);
    if(!result.ok)continue;
    const job=ctx.state.production.jobs.find(j=>j.id===result.jobId);job.orderId=entry.id;
    entry.remaining--;
    if(!entry.remaining)q.entries.shift();
  }
}
