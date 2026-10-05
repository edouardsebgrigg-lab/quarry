// Lasting proof of performed actions, and a bounded record of the guided journey.
import { getDate } from '../core/index.js';
import { pileTotal } from '../quarry/index.js';
import { barrowFill } from '../handtools/index.js';

export function objectiveState(ctx) {
  const o=ctx.state.objectives??={index:0,introSeen:false};
  if(!o.history&&o.index>=ctx.data.objectives.steps.length)o.completion??={legacy:true};
  o.evidence??={};o.history??={};o.guideEnabled??=true;
  for(const step of ctx.data.objectives.steps.slice(0,o.index)) {
    o.history[step.id]??={legacy:true}; // Existing completion is not a new reward.
  }
  return o;
}
export function observeObjectives(ctx,type,payload={}) {
  const e=objectiveState(ctx).evidence;
  if(type==='shovelDug'&&payload.tonnes>0)e.shovel=true;
  if(barrowFill(ctx)>=.9)e.barrowFull=true;
  const pickup=Math.max(0,...ctx.state.machines.filter(m=>m.type==='pickup').map(m=>pileTotal(m.load)));
  e.pickupLoad=Math.max(e.pickupLoad??0,pickup);
  if(type==='weighedIn'&&payload.tonnes>0)e.weighed=true;
  if(type==='modBought')e.modified=true;
  if(type==='rockDug'&&payload.tonnes>0)e.machineDug=true;
  if(type==='machineBought'&&!payload.rental&&payload.tier&&payload.tier!=='rusty')e.upgraded=true;
  if(type==='productSold'&&payload.tonnes>0) {
    e.sold=true;
    const m=ctx.state.machines.find(m=>m.id===payload.machineId);
    if(m?.type==='tractor')e.trailerSale=Math.max(e.trailerSale??0,payload.tonnes);
    if(m?.type==='truck')e.truckSale=true;
  }
}
export function recordObjective(ctx,step) {
  objectiveState(ctx).history[step.id]={...getDate(ctx.state,ctx.data),reward:step.reward};
}
export function finishJourney(ctx) {
  const o=objectiveState(ctx);
  if(o.index<ctx.data.objectives.steps.length||o.completion)return;
  o.completion={...getDate(ctx.state,ctx.data),earned:ctx.state.stats.totalEarned,
    tonnesSold:ctx.state.stats.tonnesSold,tonnesDug:ctx.state.stats.tonnesDug,
    machines:ctx.state.machines.filter(m=>!m.rental).length};
  ctx.events.emit('journeyCompleted',{...o.completion});
}
export function journeyJournal(ctx) {
  const o=ctx.state.objectives;
  return ctx.data.objectives.steps.map((s,i)=>({...s,number:i+1,
    status:i<o.index?'completed':i===o.index?'current':'upcoming',record:o.history?.[s.id]??null}));
}
export function setGuideEnabled(ctx,enabled) {
  if(typeof enabled!=='boolean')return {ok:false,reason:'Choose whether to show the guide'};
  objectiveState(ctx).guideEnabled=enabled;
  ctx.events.emit('guideChanged',{enabled});return {ok:true};
}
