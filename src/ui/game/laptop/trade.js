import { el, clear, setText } from '../../dom.js';
import { money, tonnes } from '../../format.js';
import { buyerDemand, buyerRelationship, quoteBuyerDelivery } from '../../../trade/index.js';
import { loadCarrier } from '../../../machinery/trailers.js';
import { bestDeliveryQuote } from '../../../economy/index.js';
import { pileTotal } from '../../../quarry/index.js';

export function tradeApp({game,world,setHead,feedback}) {
  setHead('Regional trade','Find an outlet, weigh your load and deliver it yourself');
  const {ctx,data}=game,node=el('div',{class:'qo-body'});
  const material=el('select',{class:'lt-select','aria-label':'Material to compare'},Object.entries(data.materials).filter(([id])=>id!=='mixed').map(([id,m])=>el('option',{value:id},m.name)));
  const quantity=el('input',{class:'text-input',type:'number',min:.02,max:100,step:.25,value:1,'aria-label':'Tonnes to compare'});
  const live=el('input',{type:'checkbox',id:'trade-live-load'});
  const intro=el('div',{class:'lt-card'},el('div',{class:'qo-form'},el('label',{class:'qo-field'},'Material',material),el('label',{class:'qo-field'},'Tonnes',quantity)),
    el('label',{class:'qo-actions',for:'trade-live-load'},live,'Use selected vehicle’s current load'),
    el('p',{class:'lt-note'},'Comparison quotes change with prices and demand. Each business has a public weighbridge and a yellow delivery pad. Press T while stopped with your unloading point inside the pad. Any excess load stays aboard.'));
  const summary=el('p',{class:'lt-note'}),list=el('div',{class:'trade-buyers'}),history=el('div',{class:'qo-reports'});
  node.append(intro,summary,list,el('h3',{},'Recent regional deliveries'),history);
  let key='';
  function refresh() {
    const m=game.state.machines.find(m=>m.id===game.state.player.selectedMachineId);
    const amount=Number(quantity.value),load=live.checked?(loadCarrier(ctx,m)?.load??{}):Number.isFinite(amount)&&amount>0?{[material.value]:Math.min(amount,100)}:{};
    material.disabled=quantity.disabled=live.checked;
    const info=world.mapInfo(),entries=Object.entries(data.trade.buyers).map(([id,cfg])=>{
      const place=info.buyers.find(b=>b.id===id),q=quoteBuyerDelivery(ctx,id,load),r=buyerRelationship(ctx,id);
      const delivered=game.state.trade.lifetime[id]??0,next=data.trade.relationships.find(t=>t.tonnes>delivered);
      return {id,cfg,q,r,delivered,next,dist:Math.round(Math.hypot((place.yard.x0+place.yard.x1)/2-info.you.x,(place.yard.z0+place.yard.z1)/2-info.you.z)),demands:Object.keys(cfg.products).map(mat=>[mat,buyerDemand(ctx,id,mat)])};
    }).sort((a,b)=>(b.q.gross??0)-(a.q.gross??0));
    const receipts=[...game.state.trade.history].slice(-8).reverse();
    const depot=pileTotal(load)>0?bestDeliveryQuote(ctx,load):null;
    const k=JSON.stringify([entries,receipts,depot,game.state.player.navigationBuyerId]);if(key===k)return;key=k;
    setText(summary,depot?`Comparing ${tonnes(pileTotal(load))}. Ashby Aggregates would pay ${money(depot.gross)} today (${depot.grade.toLowerCase()}). Distances below are straight-line estimates; follow the roads.`:'Choose a load to compare.');
    clear(list);clear(history);
    for(const e of entries)list.append(el('article',{class:'lt-card trade-buyer',dataset:{buyerId:e.id}},
      el('div',{class:'qo-plant-head'},el('h3',{},e.cfg.name),el('b',{},e.q.ok?money(e.q.gross):'No quote')),
      el('p',{class:'lt-note'},e.cfg.description),
      el('p',{},`${e.r.name} · ${Math.round(e.r.bonus*100)}% loyalty bonus · ${e.dist} m away`),
      el('p',{class:'lt-note'},e.next?`${tonnes(e.next.tonnes-e.delivered)} more for ${e.next.name.toLowerCase()} (+${Math.round(e.next.bonus*100)}%)`:`${tonnes(e.delivered)} supplied · highest supplier tier`),
      el('div',{class:'qo-reserves'},e.demands.map(([mat,t])=>el('div',{},el('span',{},data.materials[mat].name),el('b',{},`${tonnes(t)} wanted today`)))),
      el('p',{class:'lt-note'},e.q.ok?`${tonnes(e.q.tonnes)} accepted · ${e.q.grade}${e.q.remaining>1e-8?` · ${tonnes(e.q.remaining)} stays aboard`:''}`:e.q.reason),
      el('button',{class:'btn btn-small',onClick:()=>{const selected=game.state.player.navigationBuyerId===e.id;const r=game.actions.navigateBuyer(selected?null:e.id);if(r.ok)feedback.message(selected?'Delivery guide cleared':`Guide set to ${e.cfg.name}`,'good');refresh();}},game.state.player.navigationBuyerId===e.id?'Clear delivery guide':'Guide me here')));
    if(!receipts.length)history.append(el('p',{class:'lt-note'},'Your first regional delivery will appear here. No contract is needed.'));
    for(const r of receipts)history.append(el('div',{class:'lt-card qo-plant-head'},el('span',{},`Day ${r.day} · ${data.trade.buyers[r.buyerId].name} · ${tonnes(r.tonnes)} ${data.materials[r.material].name}`),el('b',{class:'up'},money(r.revenue))));
  }
  for(const c of [material,quantity,live])c.addEventListener('input',refresh);
  refresh();return {node,refresh,headSet:true};
}
