import {el,clear,setText} from '../../dom.js';
import {money,tonnes} from '../../format.js';
import {productionQueue,productionQueueStatus} from '../../../production/index.js';
import {stockpileConfig} from '../../../buildings/index.js';

export function productionQueuePanel({game,feedback}) {
  const {ctx,data}=game,node=el('div',{class:'qo-body'}),updates=[];
  const report=r=>{if(!r.ok)feedback?.message(r.reason,'warn');return r.ok;};
  const reserve=el('input',{class:'text-input',id:'production-cash-reserve',type:'number',min:0,step:1,value:game.state.production.cashReserve});
  const saved=el('p',{class:'lt-note'});
  node.append(el('div',{class:'qo-intro'},el('h3',{},'Keep the yard working'),el('p',{class:'lt-note'},'Orders run in sequence for each plant while game time advances. Waiting orders reserve nothing and charge nothing. Add them from Production; the next batch waits for suitable feed, free space, a working plant and enough cash.')),
    el('div',{class:'lt-card'},el('label',{class:'qo-field',for:reserve.id},'Keep this much cash for other work',reserve),
      el('button',{class:'btn btn-small',onClick:()=>{if(report(game.actions.setProductionCashReserve(Number(reserve.value))))feedback?.message('Automatic production cash reserve saved','good');refresh();}},'Save cash reserve'),saved));
  for(const [plantId,cfg] of Object.entries(data.production.plants)) {
    const status=el('p',{class:'qo-reason'}),list=el('div',{class:'qo-queue-list'}),toggle=el('button',{class:'btn btn-small',onClick:()=>{report(game.actions.pauseProductionQueue(plantId,!productionQueue(ctx,plantId).paused));refresh();}});
    const card=el('article',{class:'lt-card',dataset:{queuePlant:plantId}},el('div',{class:'qo-plant-head'},el('h3',{},cfg.name),toggle),status,list);
    node.append(card);let key='';
    updates.push(()=>{
      const q=productionQueue(ctx,plantId),s=productionQueueStatus(ctx,plantId);
      setText(status,s.reason);setText(toggle,q.paused?'Resume queue':'Pause queue');toggle.disabled=!q.entries.length;
      const k=JSON.stringify(q);if(k===key)return;key=k;clear(list);
      if(!q.entries.length)list.append(el('p',{class:'lt-note'},'No waiting batches. A running batch, if any, continues independently.'));
      for(const [i,e] of q.entries.entries()) {
        const r=e.request,bay=id=>stockpileConfig(ctx,id)?.name??id;
        const up=el('button',{class:'lt-link','aria-label':`Move order ${i+1} earlier`,onClick:()=>{report(game.actions.moveQueuedProduction(plantId,e.id,-1));refresh();}},'Earlier');up.disabled=i===0;
        const down=el('button',{class:'lt-link','aria-label':`Move order ${i+1} later`,onClick:()=>{report(game.actions.moveQueuedProduction(plantId,e.id,1));refresh();}},'Later');down.disabled=i===q.entries.length-1;
        list.append(el('div',{class:'qo-queue-entry',dataset:{orderId:e.id}},el('b',{},`${i+1}. ${data.production.recipes[r.recipeId]?.name??r.recipeId}`),
          el('p',{class:'lt-note'},`${e.remaining} of ${e.total} batches left to start · ${tonnes(r.tonnes)} each · ${bay(r.sourceBay)} → ${bay(r.outputBay)}`),
          el('div',{class:'qo-actions'},up,down,el('button',{class:'lt-link',onClick:()=>{report(game.actions.removeQueuedProduction(plantId,e.id));refresh();}},'Remove order'))));
      }
    });
  }
  node.append(el('p',{class:'lt-note'},'Pausing or removing orders leaves the current batch running. Cancelling a running batch on Production also pauses that plant’s queue. Manual Start batch can spend below the automatic cash reserve.'));
  function refresh(){setText(saved,`Automatic batches leave at least ${money(game.state.production.cashReserve)} in the bank. This is a spending limit, not a separate account.`);for(const f of updates)f();}
  refresh();return {node,refresh};
}
