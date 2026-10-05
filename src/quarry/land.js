// Neighbouring parcels share the home company's fleet and yard, but have independent
// finite terrain. The original home grid and its save format never change dimensions.
import { createGround } from '../ground/index.js';
import { getDate } from '../core/clock.js';
import { canAfford, spendMoney } from '../economy/index.js';

const inRect = (r,x,z) => x>=r.x0&&x<=r.x1&&z>=r.z0&&z<=r.z1;
const bounds = plot => ({x0:plot.origin[0],z0:plot.origin[1],x1:plot.origin[0]+plot.width,z1:plot.origin[1]+plot.depth});
const configs = ctx => ctx.data.land?.parcels ?? {};
export function landState(ctx) {
  const s=ctx.state.land??={};s.owned??={};s.purchases??=[];return s;
}
export function landParcels(ctx) {
  return Object.entries(configs(ctx)).map(([id,cfg])=>{
    const plot=ctx.data.ground.plots[cfg.plot];
    return {id,...cfg,...bounds(plot),area:plot.width*plot.depth,owned:ctx.state.land?.owned?.[id]===true};
  });
}
export function parcelGround(ctx,id) {
  if(id==='home')return ctx.ground;
  const cfg=configs(ctx)[id];if(!cfg)return null;
  const cache=ctx.parcelGrounds??={};
  return cache[id]??=createGround(ctx.data.ground,cfg.plot,{seed:(ctx.state.seed+cfg.seedOffset)>>>0});
}
export function groundAt(ctx,x,z,{ownedOnly=true}={}) {
  if(!Number.isFinite(x)||!Number.isFinite(z))return null;
  if(ctx.ground?.inside?.(x,z))return ctx.ground;
  // Small rule-test contexts can supply a minimal ground implementation.
  if(ctx.ground&&!ctx.ground.inside&&ctx.ground.workable?.(x,z))return ctx.ground;
  for(const [id,cfg] of Object.entries(configs(ctx))) {
    const plot=ctx.data.ground.plots[cfg.plot];
    if(x<plot.origin[0]||z<plot.origin[1]||x>=plot.origin[0]+plot.width||z>=plot.origin[1]+plot.depth)continue;
    return !ownedOnly||ctx.state.land?.owned?.[id]===true?parcelGround(ctx,id):null;
  }
  return null;
}
export function availableGrounds(ctx,{all=false}={}) {
  if(all)for(const p of landParcels(ctx))parcelGround(ctx,p.id);
  return [ctx.ground,...Object.values(ctx.parcelGrounds??{})].filter(Boolean);
}
export function loadLand(ctx) {
  landState(ctx);
  for(const [id,saved] of Object.entries(ctx.state.parcelGrounds??{})) {
    const cfg=configs(ctx)[id];
    if(!cfg||saved?.plotId!==cfg.plot)throw new Error('Unknown saved land parcel');
    parcelGround(ctx,id).load(saved);
  }
}
export function saveLand(ctx) {
  const saved={};
  for(const [id,g] of Object.entries(ctx.parcelGrounds??{}))saved[id]=g.serialize();
  ctx.state.parcelGrounds=saved;
}
export function ownsLandAt(ctx,x,z) {
  return landParcels(ctx).some(p=>p.owned&&(inRect(p,x,z)||inRect(p.access,x,z)));
}
export function buyLand(ctx,id) {
  const cfg=configs(ctx)[id];
  if(!cfg)return {ok:false,reason:'Choose a field that is for sale'};
  const s=landState(ctx);
  if(s.owned[id])return {ok:false,reason:'You already own this field'};
  if(!canAfford(ctx,cfg.price))return {ok:false,reason:'Not enough money to buy this field'};
  parcelGround(ctx,id); // Initialise before charging; generation uses its own seed.
  s.owned[id]=true;
  s.purchases.push({id,price:cfg.price,...getDate(ctx.state,ctx.data)});
  spendMoney(ctx,cfg.price,'landPurchase');
  ctx.events.emit('landPurchased',{id,name:cfg.name,price:cfg.price});
  return {ok:true};
}
export function navigateLand(ctx,id) {
  if(id!==null&&!configs(ctx)[id])return {ok:false,reason:'Choose a neighbouring field'};
  ctx.state.player.navigationLandId=id;
  ctx.state.player.navigationMachineId=null;ctx.state.player.navigationBuyerId=null;
  if(ctx.state.operations)ctx.state.operations.workAreaId=null;
  ctx.events.emit('landNavigationChanged',{id});return {ok:true};
}
export function surveyLand(ctx,id) {
  const p=landParcels(ctx).find(p=>p.id===id);if(!p)return null;
  const g=parcelGround(ctx,id),n=ctx.data.land.surveySamplesPerSide,estimates={};
  let cover=0,rock=0;
  for(let j=0;j<n;j++)for(let i=0;i<n;i++) {
    const col=g.inspectAt(p.x0+(i+.5)/n*(p.x1-p.x0),p.z0+(j+.5)/n*(p.z1-p.z0));
    cover+=col.bedrockDepth;rock+=col.rockRemaining??0;
    for(const layer of col.layers)for(const [id,share] of Object.entries(layer.composition??{[layer.material]:1})) {
      const mat=ctx.data.ground.materials[id];
      estimates[id]=(estimates[id]??0)+layer.thickness*share*mat.density/(layer.kind==='loose'?mat.swell:1);
    }
  }
  for(const id of Object.keys(estimates))estimates[id]*=p.area/(n*n);
  return {...p,estimates,coverDepth:cover/(n*n),rockDepth:rock/(n*n),rockTonnes:rock/(n*n)*p.area*ctx.data.ground.materials.rock.density};
}
