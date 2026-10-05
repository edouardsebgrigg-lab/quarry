// Working plans are saved choices over sampled physical columns, never a resource ledger.
import { getDate } from '../core/clock.js';
import { surveyWorkArea, activeWorkArea, setWorkArea } from './operations.js';

export function faceTarget(ctx,sample,materialId) {
  if(!sample||!ctx.data.ground.materials[materialId])return null;
  for(const layer of sample.layers) {
    const share=layer.composition?.[materialId]??(layer.material===materialId?1:0);
    if(share>=ctx.data.operations.survey.targetMinimumShare)
      return {depth:layer.depth,thickness:layer.thickness,share,kind:layer.kind};
  }
  if(materialId==='rock'&&sample.rockRemaining>0)
    return {depth:sample.bedrockDepth,thickness:sample.rockRemaining,share:1,kind:'bedrock'};
  return null;
}

export function surveyFaces(ctx,areaId,materialId) {
  if(!ctx.data.ground.materials[materialId])return null;
  const survey=surveyWorkArea(ctx,areaId);if(!survey)return null;
  const samples=survey.samples.map((sample,index)=>({...sample,index,target:faceTarget(ctx,sample,materialId)}));
  const candidates=samples.filter(s=>s.target).sort((a,b)=>a.target.depth-b.target.depth||b.target.share-a.target.share||b.target.thickness-a.target.thickness||a.index-b.index);
  return {...survey,samples,materialId,recommendedIndex:candidates[0]?.index??null};
}

export function planWorkFace(ctx,{areaId,materialId,sampleIndex}={}) {
  const survey=surveyFaces(ctx,areaId,materialId);
  if(!survey)return {ok:false,reason:'Choose an owned work area and a ground material'};
  if(!Number.isInteger(sampleIndex)||!survey.samples[sampleIndex])return {ok:false,reason:'Choose a borehole sample'};
  const sample=survey.samples[sampleIndex];
  if(!sample.target)return {ok:false,reason:'This sample has no suitable layer of the chosen material'};
  const operations=ctx.state.operations??={};
  (operations.faces??={})[areaId]={materialId,sampleIndex,baseline:{...sample.target},...getDate(ctx.state,ctx.data)};
  setWorkArea(ctx,areaId);
  ctx.events.emit('workFacePlanned',{areaId,materialId,sampleIndex,x:sample.x,z:sample.z});
  return {ok:true};
}

export function clearWorkFace(ctx,areaId) {
  if(!ctx.state.operations?.faces?.[areaId])return {ok:false,reason:'This area has no saved face plan'};
  delete ctx.state.operations.faces[areaId];
  ctx.events.emit('workFaceCleared',{areaId});return {ok:true};
}

export function workFacePlan(ctx,areaId) {
  const p=ctx.state.operations?.faces?.[areaId],side=ctx.data.operations.survey.samplesPerSide;
  if(!p||!ctx.data.ground.materials[p.materialId]||!Number.isInteger(p.sampleIndex)||p.sampleIndex<0||p.sampleIndex>=side*side)return null;
  if(!Number.isFinite(p.baseline?.depth)||p.baseline.depth<0||!Number.isFinite(p.baseline.thickness)||p.baseline.thickness<=0)return null;
  return p;
}

export function activeWorkFace(ctx) {
  const area=activeWorkArea(ctx),plan=workFacePlan(ctx,area?.id);
  if(!area||!plan)return null;
  // Navigation is a saved coordinate, so it needn't resurvey nine columns every frame.
  const side=ctx.data.operations.survey.samplesPerSide,i=plan.sampleIndex;
  if(!Number.isInteger(i)||i<0||i>=side*side||!ctx.data.ground.materials[plan.materialId])return null;
  return {areaId:area.id,materialId:plan.materialId,sampleIndex:i,
    x:area.x0+(i%side+.5)/side*(area.x1-area.x0),
    z:area.z0+(Math.floor(i/side)+.5)/side*(area.z1-area.z0),
    label:`${ctx.data.ground.materials[plan.materialId].name} face · ${area.name}`};
}
