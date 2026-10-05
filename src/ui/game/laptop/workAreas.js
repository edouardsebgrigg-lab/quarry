import { el, clear, setText } from '../../dom.js';
import { workAreas, activeWorkArea, surveyFaces, workFacePlan } from '../../../quarry/index.js';
import { landParcels } from '../../../quarry/land.js';

export function workAreasPanel({game,feedback}) {
  const {ctx,data}=game,areas=workAreas(ctx),minimum=data.operations.survey.targetMinimumShare;
  let selected=activeWorkArea(ctx)?.id??areas[0]?.id;
  let materialId=workFacePlan(ctx,selected)?.materialId??'sand';
  let sampleIndex=workFacePlan(ctx,selected)?.sampleIndex??null;
  const node=el('div',{class:'qo-work-areas'}),grid=el('div',{class:'qo-area-grid'});
  const field=el('select',{id:'work-field',class:'lt-select','aria-label':'Work field'},el('option',{value:'home'},'Home Field'),
    landParcels(ctx).filter(p=>p.owned).map(p=>el('option',{value:p.id},p.name)));
  field.value=areas.find(a=>a.id===selected)?.parcelId??'home';
  const target=el('select',{id:'face-material',class:'lt-select','aria-label':'Target material'},
    Object.entries(data.ground.materials).map(([id,m])=>el('option',{value:id},m.name)));
  target.value=materialId;
  const detail=el('div',{class:'qo-face-detail'}),summary=el('p',{class:'lt-note'});
  const controls=el('div',{class:'qo-form'},el('label',{class:'qo-field',for:field.id},'Field',field),
    el('label',{class:'qo-field',for:target.id},'Target material',target));
  node.append(el('div',{class:'qo-intro'},el('h3',{},'Choose a working face'),
    el('p',{class:'lt-note'},'Compare actual sampled columns, then mark a digging point. A plan guides your work; you still strip, dig and haul the material yourself.')),controls,grid,summary,detail);
  const notify=r=>{if(!r.ok)feedback?.message(r.reason,'warn');return r.ok;};
  function chooseArea(id) {
    selected=id;const saved=workFacePlan(ctx,id);
    sampleIndex=saved?.sampleIndex??null;
    if(saved){materialId=saved.materialId;target.value=materialId;}
    render();
  }
  function drawAreas() {
    clear(grid);
    for(const area of areas.filter(a=>a.parcelId===field.value))grid.append(el('button',{
      class:'qo-area',dataset:{areaId:area.id},onClick:()=>chooseArea(area.id)
    },area.name.split(' · ').at(-1)));
  }
  field.addEventListener('change',()=>{drawAreas();chooseArea(areas.find(a=>a.parcelId===field.value)?.id);});
  target.addEventListener('change',()=>{materialId=target.value;sampleIndex=null;render();});
  function render() {
    const survey=surveyFaces(ctx,selected,materialId);clear(detail);
    for(const b of grid.children)b.setAttribute('aria-pressed',String(b.dataset.areaId===selected));
    if(!survey){setText(summary,'No owned field survey is available.');return;}
    sampleIndex??=survey.recommendedIndex??0;
    const sample=survey.samples[sampleIndex],saved=workFacePlan(ctx,selected);
    const samePlan=saved?.materialId===materialId&&saved?.sampleIndex===sampleIndex;
    const material=data.ground.materials[materialId].name;
    setText(summary,`${survey.name} · ${Math.round(survey.area).toLocaleString()} m² · sampled bedrock ${survey.shallowest.toFixed(1)}–${survey.deepest.toFixed(1)} m down`);
    const boreholes=el('div',{class:'qo-boreholes'});
    for(const s of survey.samples)boreholes.append(el('button',{class:'qo-borehole','aria-pressed':String(s.index===sampleIndex),dataset:{sampleIndex:s.index},onClick:()=>{sampleIndex=s.index;render();}},
      el('b',{},`B${s.index+1}${s.index===survey.recommendedIndex?' · least cover':''}`),
      el('span',{},s.target?`${s.target.depth.toFixed(2)} m cover`:'No suitable layer'),
      el('small',{},s.target?`${s.target.thickness.toFixed(2)} m ${material.toLowerCase()}`:'Inspect this column')));
    const guide=el('button',{class:'btn btn-primary',disabled:!sample.target,onClick:()=>{
      if(notify(game.actions.planWorkFace({areaId:selected,materialId,sampleIndex})))feedback?.message(`${material} face B${sampleIndex+1} saved and marked in the field.`,'good');render();
    }},samePlan?'Update plan and guide here':'Save face plan and guide here');
    const profile=el('div',{class:'qo-column-profile','aria-label':`Borehole ${sampleIndex+1} layers`});
    const rows=[...sample.layers,{material:'rock',depth:sample.bedrockDepth,thickness:sample.rockRemaining,kind:'bedrock'}].filter(l=>l.thickness>0);
    for(const layer of rows) {
      const shares=layer.composition?Object.entries(layer.composition).map(([id,v])=>`${data.ground.materials[id].name} ${(v*100).toFixed(0)}%`).join(' · '):null;
      profile.append(el('div',{class:'qo-column-layer',style:{borderLeftColor:data.ground.materials[layer.material]?.color??'#777'}},
        el('b',{},`${layer.depth.toFixed(2)}–${(layer.depth+layer.thickness).toFixed(2)} m`),
        el('span',{},data.ground.materials[layer.material].name),
        el('small',{},layer.kind==='bedrock'?'Intact rock · breaker or contractor cut':`${layer.kind}${shares?` · ${shares} by volume`:''}`)));
    }
    if(!rows.length)profile.append(el('p',{class:'lt-note'},'This column has reached the bottom of its reserve.'));
    let comparison='';
    if(samePlan&&saved.baseline)comparison=sample.target?
      `At this point: cover ${(sample.target.depth-saved.baseline.depth)>=0?'+':''}${(sample.target.depth-saved.baseline.depth).toFixed(2)} m and layer ${(sample.target.thickness-saved.baseline.thickness)>=0?'+':''}${(sample.target.thickness-saved.baseline.thickness).toFixed(2)} m since the plan. These are depth changes, not measured production.`:
      'The planned layer is no longer present at this sample. Inspect another borehole or choose a different material.';
    const actions=el('div',{class:'qo-actions'},guide,
      el('button',{class:'btn',onClick:render},'Refresh boreholes'),
      el('button',{class:'lt-link',onClick:()=>{notify(game.actions.recordSurvey(selected));render();}},game.state.operations?.surveys?.[selected]?'Replace recorded survey':'Record survey'));
    if(saved)actions.append(el('button',{class:'lt-link',onClick:()=>{notify(game.actions.clearWorkFace(selected));render();}},'Clear saved face'));
    actions.append(el('button',{class:'lt-link',onClick:()=>{game.actions.setWorkArea(null);render();}},'Follow current goal'));
    const reserves=el('div',{class:'qo-reserves'}),previous=game.state.operations?.surveys?.[selected];
    for(const [id,t] of Object.entries(survey.estimates))reserves.append(el('div',{},el('span',{},data.ground.materials[id].name),
      el('b',{},`≈ ${Math.round(t).toLocaleString()} t${previous?` (${Math.round(t-(previous.estimates[id]??0))>=0?'+':''}${Math.round(t-(previous.estimates[id]??0)).toLocaleString()} since survey)`:''}`)));
    detail.append(el('p',{class:'lt-note'},`North is the top row. Least cover selects the shallowest sampled layer with at least ${(minimum*100).toFixed(0)}% ${material.toLowerCase()} by volume. The ground between samples can differ.`),boreholes,
      el('article',{class:'lt-card qo-face-card'},el('h3',{},`B${sampleIndex+1} · ${material} face`),
        el('p',{class:'lt-note'},`X ${sample.x.toFixed(1)}, Z ${sample.z.toFixed(1)} · depths below the current surface`),
        el('p',{class:'qo-face-advice'},sample.target?sample.target.kind==='bedrock'?'Strip the cover, leave an access ramp, then use a compatible breaker or prepare a contractor cut.':sample.target.depth>.001?'Strip the cover into separate heaps before working this layer. Leave room for your machine and an access ramp.':'The target layer is exposed here. Keep separate loads and inspect the face again as you dig deeper.':'No suitable target layer at this borehole. Inspect the column or try a different sample.'),
        profile,
        saved?el('p',{class:'lt-note qo-face-saved'},`Saved: ${data.ground.materials[saved.materialId]?.name??saved.materialId} · B${saved.sampleIndex+1} · day ${saved.day}${samePlan&&activeWorkArea(ctx)?.id===selected?' · following this face':''}`):null,
        comparison?el('p',{class:'lt-note qo-face-comparison'},comparison):null,actions),
      el('details',{class:'lt-card qo-area-reserves'},el('summary',{},'Approximate area reserves'),reserves,
        previous?el('p',{class:'lt-note'},`Recorded on day ${previous.day}, ${String(previous.hour).padStart(2,'0')}:${String(previous.minute).padStart(2,'0')}.`):null,
        el('p',{class:'lt-note'},'Above-bedrock estimates include deposited heaps and compacted fill. Survey changes are sampled estimates, not measured extraction or guaranteed saleable tonnes.')));
  }
  drawAreas();render();return {node,refresh(){}};
}
