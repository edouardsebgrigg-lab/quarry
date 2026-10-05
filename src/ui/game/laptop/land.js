import { el, setText } from '../../dom.js';
import { money, tonnes } from '../../format.js';
import { landParcels, surveyLand } from '../../../quarry/land.js';

export function landPanel({game,feedback}) {
  const {ctx,data}=game;
  const node=el('div',{class:'qo-land'});
  const home=data.ground.plots[data.sites.home.groundPlot];
  const total=el('p',{class:'lt-note'});
  node.append(el('div',{class:'qo-intro'},el('h3',{},'Give the quarry room to grow'),
    el('p',{class:'lt-note'},'Buy neighbouring fields outright, then take your equipment through their access openings. Your existing yard serves every field. Different layers reward different machines and handling plans.'),total));
  const cards=[];
  for(const p of landParcels(ctx)) {
    const status=el('span',{class:'qo-land-status'}),reason=el('p',{class:'lt-note'}),survey=el('div',{class:'qo-land-survey'});
    const buy=el('button',{class:'btn btn-primary',onClick:()=>{
      const r=game.actions.buyLand(p.id);
      if(!r.ok)feedback?.message(r.reason,'warn');
      else feedback?.message(`${p.name} is yours. Its access is open to your site machines.`,'good');
      refresh();
    }},`Buy field · ${money(p.price)}`);
    const inspect=()=>{
      const s=surveyLand(ctx,p.id);
      survey.replaceChildren(el('h4',{},'Sampled reserves'),
        el('p',{class:'lt-note'},`${s.coverDepth.toFixed(1)} m average cover above bedrock. Samples estimate the current ground; the material you actually excavate is measured separately.`),
        el('dl',{class:'qo-land-estimates'},Object.entries(s.estimates).map(([id,t])=>[
          el('dt',{},data.materials[id].name),el('dd',{},`≈ ${tonnes(t)}`)]),
          el('dt',{},'Intact rock'),el('dd',{},`≈ ${tonnes(s.rockTonnes)}`)));
    };
    const card=el('article',{class:'lt-card qo-land-card',dataset:{parcelId:p.id}},
      el('div',{class:'qo-plant-head'},el('h3',{},p.name),status),
      el('div',{class:'lt-card-label'},`${(p.area/10000).toFixed(2)} hectares`),
      el('p',{},p.description),el('p',{class:'lt-note'},p.geology),
      el('div',{class:'qo-actions'},buy,
        el('button',{class:'btn',onClick:()=>{game.actions.navigateLand(p.id);feedback?.message(`${p.name} marked on your map and field guide.`,'info');}},'Guide to entrance'),
        el('button',{class:'btn',onClick:inspect},'Survey ground')),
      reason,survey);
    cards.push({p,status,buy,reason});node.append(card);
  }
  function refresh() {
    const parcels=landParcels(ctx),area=home.width*home.depth+parcels.filter(p=>p.owned).reduce((t,p)=>t+p.area,0);
    const count=1+parcels.filter(p=>p.owned).length;
    setText(total,`Owned: ${(area/10000).toFixed(2)} hectares across ${count} ${count===1?'field':'fields'}. Home Field and your existing excavations stay yours.`);
    for(const {p,status,buy,reason} of cards) {
      const owned=game.state.land.owned[p.id]===true,affordable=game.state.money>=p.price;
      setText(status,owned?'Owned':'For sale');status.classList.toggle('up',owned);
      buy.hidden=owned;buy.disabled=!affordable;
      setText(reason,owned?'Use Work areas to choose and survey a working face.':affordable?'Purchase includes the field and its marked access.':'Keep selling and build up enough cash before buying.');
    }
  }
  refresh();return {node,refresh};
}
