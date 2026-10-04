// Fictional contractor cuts. Rock stays on the field; machines still have to load it.
import { ticksPerHour, tickSeconds, getDate } from '../core/index.js';
import { canAfford, spendMoney } from '../economy/index.js';

export function blastingState(ctx) {
  const s=ctx.state.blasting??={};
  s.projects??=[];s.history??=[];s.nextId??=1;s.releasedTonnes??=0;s.fired??=0;
  return s;
}
export const activeBlast = ctx => ctx.state.blasting?.projects.find(p=>p.siteId===ctx.state.currentSiteId)??null;
const fail = reason => ({ok:false,reason});
const project = (ctx,id) => activeBlast(ctx)?.id===id ? activeBlast(ctx) : null;

export function quoteBlast(ctx,request={}) {
  const cfg=ctx.data.blasting.patterns[request.patternId];
  if(!cfg)return fail('Choose a cut size');
  if(!ctx.ground)return fail('There is no quarry field here');
  const spec={x:request.x,z:request.z,radius:cfg.radius,depth:cfg.depth,maxCover:ctx.data.blasting.maximumCover};
  const plan=ctx.ground.planFracture(spec);
  const affordable=canAfford(ctx,cfg.drillCost);
  const busy=!!activeBlast(ctx);
  return {...plan,spec,name:cfg.name,patternId:request.patternId,drillCost:cfg.drillCost,chargeCost:cfg.chargeCost,
    drillHours:cfg.drillHours,chargeHours:cfg.chargeHours,cost:cfg.drillCost+cfg.chargeCost,
    clearance:cfg.radius+ctx.data.blasting.clearance,affordable,valid:plan.ok,
    ok:plan.ok&&affordable&&!busy,
    reason:plan.reason??(busy?'Finish or cancel the current cut first':!affordable?'Not enough money to book drilling':null)};
}

export function startBlast(ctx,request) {
  const q=quoteBlast(ctx,request);if(!q.ok)return q;
  const s=blastingState(ctx);
  const p={id:`blast-${s.nextId++}`,siteId:ctx.state.currentSiteId,patternId:q.patternId,name:q.name,spec:q.spec,
    signature:q.signature,estimatedTonnes:q.tonnes,clearance:q.clearance,stage:'drilling',
    hours:q.drillHours,remainingHours:q.drillHours,chargeHours:q.chargeHours,chargeCost:q.chargeCost,
    cost:q.drillCost,countdownSeconds:ctx.data.blasting.countdownSeconds,...getDate(ctx.state,ctx.data)};
  s.projects.push(p);spendMoney(ctx,q.drillCost,'blastDrilling');
  ctx.events.emit('blastStarted',{id:p.id,siteId:p.siteId});
  return {ok:true,id:p.id};
}

function unchanged(ctx,p) {
  const now=ctx.ground?.planFracture(p.spec);
  if(!now?.ok)return fail(now?.reason??'The quarry ground is unavailable');
  if(now.signature!==p.signature)return fail('The drilled ground changed. Cancel this cut and survey again');
  return {ok:true};
}

export function chargeBlast(ctx,id) {
  const p=project(ctx,id);if(!p||p.stage!=='drilled')return fail('Finish drilling before charging this cut');
  const r=unchanged(ctx,p);if(!r.ok)return r;
  if(!canAfford(ctx,p.chargeCost))return fail('Not enough money for the charging crew');
  p.stage='charging';p.hours=p.chargeHours;p.remainingHours=p.chargeHours;p.cost+=p.chargeCost;
  spendMoney(ctx,p.chargeCost,'blastCharging');return {ok:true};
}

// The world supplies fresh positions on demand. Never trust saved placements for firing.
// Without a running world, preparation can progress but firing remains unavailable.
export function blastClearance(ctx,id) {
  const p=project(ctx,id);if(!p)return fail('There is no cut here');
  const occupants=ctx.blastOccupants?.();
  if(!Array.isArray(occupants)||!occupants.length||occupants.some(o=>![o.x,o.z,o.r].every(Number.isFinite)||o.r<0))return fail('Waiting for live field positions');
  const blockers=occupants.filter(o=>Math.hypot(o.x-p.spec.x,o.z-p.spec.z)<=p.clearance+o.r).map(o=>o.label);
  return {ok:!blockers.length,blockers,reason:blockers.length?`Move outside the marked boundary: ${blockers.join(', ')}`:null};
}

export function fireBlast(ctx,id) {
  const p=project(ctx,id);if(!p||p.stage!=='ready')return fail('Finish charging before starting the countdown');
  const terrain=unchanged(ctx,p);if(!terrain.ok)return terrain;
  const clear=blastClearance(ctx,id);if(!clear.ok)return clear;
  p.stage='countdown';p.remainingSeconds=p.countdownSeconds;p.holdReason=null;
  ctx.events.emit('blastCountdown',{id:p.id,siteId:p.siteId,seconds:p.remainingSeconds,at:p.spec});
  return {ok:true};
}
export function abortBlast(ctx,id) {
  const p=project(ctx,id);if(!p||p.stage!=='countdown')return fail('There is no countdown to stop');
  p.stage='ready';p.remainingSeconds=0;p.holdReason='Countdown stopped. Check the field before firing again';
  return {ok:true};
}
function finish(ctx,p,status,tonnes=0) {
  const s=blastingState(ctx);
  s.projects=s.projects.filter(j=>j.id!==p.id);
  s.history.push({id:p.id,siteId:p.siteId,patternId:p.patternId,name:p.name,x:p.spec.x,z:p.spec.z,
    status,tonnes,cost:p.cost,...getDate(ctx.state,ctx.data)});
  s.history.splice(0,Math.max(0,s.history.length-ctx.data.blasting.historyLimit));
}
export function cancelBlast(ctx,id) {
  const p=project(ctx,id);if(!p)return fail('There is no cut here');
  finish(ctx,p,'cancelled');ctx.events.emit('blastCancelled',{id,siteId:p.siteId});return {ok:true};
}
export function tickBlasting(ctx) {
  const p=activeBlast(ctx);if(!p)return;
  if(p.stage==='drilling'||p.stage==='charging') {
    p.remainingHours=Math.max(0,p.remainingHours-1/ticksPerHour(ctx.data));
    if(p.remainingHours>1e-8)return;
    p.stage=p.stage==='drilling'?'drilled':'ready';p.remainingHours=0;
    ctx.events.emit('blastPrepared',{id:p.id,siteId:p.siteId,stage:p.stage});
  } else if(p.stage==='countdown') {
    // Recheck every tick, including the firing tick. An interruption needs a new command.
    const r=blastClearance(ctx,p.id);
    if(!r.ok){p.stage='ready';p.remainingSeconds=0;p.holdReason=r.reason;ctx.events.emit('blastAborted',{id:p.id,reason:r.reason});return;}
    p.remainingSeconds=Math.max(0,p.remainingSeconds-tickSeconds(ctx.data));
    if(p.remainingSeconds>1e-8)return;
    const result=ctx.ground.fracture(p.spec,p.signature);
    if(!result.ok){p.stage='ready';p.holdReason=result.reason;ctx.events.emit('blastAborted',{id:p.id,reason:result.reason});return;}
    const s=blastingState(ctx);s.releasedTonnes+=result.tonnes;s.fired++;
    finish(ctx,p,'fired',result.tonnes);
    ctx.events.emit('blastFired',{id:p.id,siteId:p.siteId,at:p.spec,tonnes:result.tonnes,cost:p.cost,material:result.material});
  }
}
