import { ownsBuilding } from '../buildings/index.js';
import { canAfford, spendMoney } from '../economy/index.js';
import { ticksPerHour } from '../core/index.js';

export function plantStatus(ctx,id) {
  const saved=ctx.state.production?.plants?.[ctx.state.currentSiteId]?.[id];
  const condition=saved?.condition??100,level=saved?.level??0;
  const upgrade=ctx.data.production.upgrades[level];
  const service=ctx.state.production?.services?.find(j=>j.siteId===ctx.state.currentSiteId&&j.plantId===id);
  return {condition,level,upgrade,service,throughput:upgrade.throughput*(ctx.data.production.maintenance.minimumThroughputFactor+(1-ctx.data.production.maintenance.minimumThroughputFactor)*condition/100),costFactor:upgrade.costFactor};
}
function mutable(ctx,id,site=ctx.state.currentSiteId) {
  const plants=ctx.state.production.plants??={};
  return (plants[site]??={})[id]??={condition:100,level:0};
}
function available(ctx,id) {
  if(!ctx.data.production.plants[id]||!ownsBuilding(ctx,id))return 'Commission this plant first';
  if(ctx.state.production.jobs.some(j=>j.plantId===id&&j.siteId===ctx.state.currentSiteId)||plantStatus(ctx,id).service)return 'Wait for this plant to finish its current work';
  return null;
}
export function upgradePlant(ctx,id) {
  const reason=available(ctx,id);if(reason)return {ok:false,reason};
  const next=ctx.data.production.upgrades[plantStatus(ctx,id).level+1];
  if(!next)return {ok:false,reason:'This plant is fully upgraded'};
  if(!canAfford(ctx,next.price))return {ok:false,reason:'Not enough money for this upgrade'};
  mutable(ctx,id).level++;spendMoney(ctx,next.price,'plantUpgrade');
  ctx.events.emit('plantUpgraded',{plantId:id});return {ok:true};
}
export function servicePlant(ctx,id) {
  const reason=available(ctx,id);if(reason)return {ok:false,reason};
  const cfg=ctx.data.production.maintenance,wear=100-plantStatus(ctx,id).condition;
  if(wear<cfg.minimumServiceWear)return {ok:false,reason:'This plant is still in good condition'};
  const cost=Math.round(wear*cfg.serviceCostPerPoint*100)/100;
  if(!canAfford(ctx,cost))return {ok:false,reason:'Not enough money to service this plant'};
  (ctx.state.production.services??=[]).push({plantId:id,siteId:ctx.state.currentSiteId,remainingHours:cfg.serviceHours,hours:cfg.serviceHours,cost});
  spendMoney(ctx,cost,'plantService');return {ok:true};
}
export function wearPlant(ctx,job) {
  const st=mutable(ctx,job.plantId,job.siteId);
  st.condition=Math.max(0,st.condition-job.tonnes*ctx.data.production.maintenance.wearPerTonne);
}
export function tickPlantServices(ctx) {
  const services=ctx.state.production.services??=[];
  for(const job of [...services]) {
    job.remainingHours-=1/ticksPerHour(ctx.data);
    if(job.remainingHours>1e-8)continue;
    mutable(ctx,job.plantId,job.siteId).condition=100;
    ctx.state.production.services=ctx.state.production.services.filter(j=>j!==job);
    ctx.events.emit('plantServiced',{plantId:job.plantId,siteId:job.siteId});
  }
}
