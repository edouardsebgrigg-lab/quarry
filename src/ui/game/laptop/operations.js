import { el, clear, setText } from '../../dom.js';
import { money, tonnes, signedMoney } from '../../format.js';
import { getDate } from '../../../core/index.js';
import { ownsBuilding, stockpileLoad, stockpileRoom, stockpileConfig } from '../../../buildings/index.js';
import { pileTotal, workAreas, surveyWorkArea, activeWorkArea } from '../../../quarry/index.js';
import { bestDeliveryQuote } from '../../../economy/index.js';

const materialsText = (data, load) => Object.entries(load).filter(([,t]) => t > 1e-8)
  .map(([id,t]) => `${data.materials[id]?.name ?? id}: ${tonnes(t)}`).join(' · ');
const timeText = hours => `${Math.max(1,Math.ceil(hours*60))} game min`;

export function operationsApp({ game, feedback, setHead, openApp }) {
  const { data, ctx } = game;
  setHead('Quarry operations', 'Plan your dig, manage the yard and turn extracted material into saleable products');
  const node = el('div', { class: 'quarry-operations' });
  const tabs = el('nav', { class: 'lt-chips qo-tabs', 'aria-label': 'Quarry operations sections' });
  const body = el('div', { class: 'qo-body' });
  node.append(tabs,body);
  let section = 'yard', refreshSection = () => {};
  const notify = r => { if (!r.ok) feedback?.message(r.reason,'warn'); return r.ok; };
  const jump = el('button', { class: 'lt-link', onClick: () => openApp('dealer') }, 'Open plant dealer');
  const heading = (title, text) => el('div', { class: 'qo-intro' }, el('h3',{},title),el('p',{class:'lt-note'},text));

  function yard() {
    const summary=el('div',{class:'lt-stats'}), stores=el('div',{class:'qo-bays'}), next=el('div',{class:'lt-card'});
    body.append(heading('Material already in your yard','Tip material into a commissioned bay with a vehicle or digger. Load finished products physically and haul them to the depot; storage and processing never make a sale.'), summary, stores, next);
    let key='';
    refreshSection=() => {
      const jobs=game.state.production.jobs;
      const owned=ownsBuilding(ctx,'stockpiles');
      const bays=data.buildings.stockpiles.bays.map(b=>({ ...stockpileConfig(ctx,b.id), load:stockpileLoad(ctx,b.id), room:stockpileRoom(ctx,b.id) }));
      const values=bays.map(b=>pileTotal(b.load)>0 ? bestDeliveryQuote(ctx,b.load).gross : 0);
      const k=JSON.stringify([owned,bays,values,jobs.map(j=>j.id),game.state.production.processed]);
      if(k===key)return; key=k;
      const total=bays.reduce((t,b)=>t+pileTotal(b.load),0), held=jobs.reduce((t,j)=>t+j.tonnes,0);
      clear(summary); clear(stores); clear(next);
      for(const [label,value,note] of [['In stock',tonnes(total),'Available in bays'],['In production',tonnes(held),'Feed held by plants'],['Processed',tonnes(game.state.production.processed),'Lifetime throughput']]) {
        summary.append(el('div',{class:'lt-stat'},el('div',{class:'lt-stat-label'},label),el('div',{class:'lt-stat-value'},value),el('div',{class:'lt-stat-note'},note)));
      }
      for(const b of bays) {
        const amount=pileTotal(b.load), quote=amount ? bestDeliveryQuote(ctx,b.load) : null;
        const reserved=b.capacity-amount-b.room;
        stores.append(el('article',{class:'lt-card qo-bay',dataset:{bayId:b.id}},el('h3',{},b.name),
          el('div',{class:'qo-bay-amount'},`${tonnes(amount)} / ${tonnes(b.capacity)}`),
          el('progress',{max:b.capacity,value:amount,'aria-label':`${b.name} stored material`}),
          el('p',{class:'lt-note'},materialsText(data,b.load)||'Empty bay'),
          el('p',{class:'lt-note'},`${tonnes(Math.max(0,b.room))} free${reserved>1e-8 ? ` · ${tonnes(reserved)} reserved for batches or arriving loads` : ''}`),
          quote ? el('div',{class:'qo-value'},`${quote.grade} · ${money(quote.gross)} depot value today`) : null));
      }
      let advice;
      if(!owned) advice='Start with stockpile bays: keep materials separate, wait for good prices and supply your future plants.';
      else if(!ownsBuilding(ctx,'crusher')) advice='Ready for the next step? A jaw crusher turns broken rock into a gravel/sand blend. Compare its batch quote before investing.';
      else if(!ownsBuilding(ctx,'screener')) advice='A screening plant separates your crusher blend into clean gravel or sand, while keeping the rejects for later.';
      else advice='You have a complete processing yard. Keep one bay free for finished product, and compare clean-product values before each batch.';
      next.append(el('div',{class:'lt-card-label'},'Grow at your own pace'),el('p',{},advice),
        el('div',{class:'qo-actions'},jump,el('button',{class:'lt-link',onClick:()=>show('production')},'Plan a batch')));
    };
  }

  function production() {
    body.append(heading('Make useful products','Batches charge their operating cost up front and run while game time advances. Cancel returns all held feed; operating costs are not refunded. Output space and cancellation space stay reserved.'));
    const running=el('div',{class:'qo-running'}), forms=el('div',{class:'qo-plants'});
    body.append(running,forms);
    const formRefresh=[];
    for(const [plantId,cfg] of Object.entries(data.production.plants)) {
      const plan=game.state.production.plans[game.state.currentSiteId]?.[plantId];
      const makeSelect = (name,options,selected) => {
        const select=el('select',{class:'lt-select',id:`${plantId}-${name}`},options.map(([value,text])=>el('option',{value},text)));
        select.value=selected;
        return {select,node:el('label',{class:'qo-field',for:select.id},name,select)};
      };
      const recipes=cfg.recipes.map(id=>[id,data.production.recipes[id].name]);
      const bayOptions=data.buildings.stockpiles.bays.map(b=>[b.id,b.name]);
      const recipe=makeSelect('Recipe',recipes,plan?.recipeId??cfg.recipes[0]);
      const source=makeSelect('Feed bay',bayOptions,plan?.sourceBay??(plantId==='screener'?'middle':'west'));
      const dest=makeSelect('Product bay',bayOptions,plan?.outputBay??(plantId==='screener'?'east':'middle'));
      const quantity=el('input',{id:`${plantId}-tonnes`,class:'text-input',type:'number',min:cfg.minimumBatch,max:cfg.maximumBatch,step:.25,value:plan?.tonnes??2});
      const quoteBox=el('div',{class:'qo-quote','aria-live':'polite'}), description=el('p',{class:'lt-note'});
      const request=()=>({plantId,recipeId:recipe.select.value,sourceBay:source.select.value,outputBay:dest.select.value,tonnes:Number(quantity.value)});
      const start=el('button',{class:'btn btn-primary',onClick:()=>{
        const r=game.actions.startProduction(request());
        if(notify(r))feedback?.message(`${cfg.name}: batch started`,'good');
        refreshSection();
      }},'Start batch');
      const status=el('span',{class:'qo-plant-state'});
      const card=el('article',{class:'lt-card qo-plant',dataset:{plantId}},
        el('div',{class:'qo-plant-head'},el('h3',{},cfg.name),status),
        el('p',{class:'lt-note'},`${cfg.tonnesPerHour} t per game hour · ${money(cfg.costPerTonne)} / t running cost`),
        el('div',{class:'qo-form'},recipe.node,source.node,dest.node,el('label',{class:'qo-field',for:quantity.id},'Batch tonnes',quantity)),
        description,quoteBox,el('div',{class:'qo-actions'},start,el('button',{class:'lt-link',onClick:()=>openApp('dealer')},'Plant dealer')));
      forms.append(card);
      let quoteKey='';
      const update=()=>{
        const q=game.actions.quoteProduction(request());
        start.disabled=!q.ok;
        setText(status,ownsBuilding(ctx,cfg.building)?'Commissioned':'Not commissioned');
        setText(description,data.production.recipes[recipe.select.value].description);
        const k=JSON.stringify(q); if(k===quoteKey)return; quoteKey=k;
        clear(quoteBox);
        if(!q.ok)quoteBox.append(el('p',{class:'qo-reason'},q.reason));
        else quoteBox.append(
          el('div',{},el('span',{},'Operating cost'),el('b',{},money(q.cost))),
          el('div',{},el('span',{},'Batch time'),el('b',{},timeText(q.hours))),
          el('p',{class:'lt-note'},`Product: ${materialsText(data,q.output)}${pileTotal(q.rejects)>0?` · Returns to feed: ${materialsText(data,q.rejects)}`:''}`),
          el('div',{},el('span',{},'Indicative value change'),el('b',{class:q.estimatedUplift>=0?'up':'down'},signedMoney(q.estimatedUplift))),
          el('p',{class:'lt-note'},'Today’s separate depot quotes, less processing cost. Prices, purity and market saturation can change; hauling is still required.'));
      };
      for(const control of [recipe.select,source.select,dest.select,quantity])control.addEventListener('input',()=>{
        game.actions.saveProductionPlan(request());
        update();
      });
      formRefresh.push(update);
    }
    const jobNodes=new Map();
    refreshSection=()=>{
      const jobs=game.state.production.jobs.filter(j=>j.siteId===game.state.currentSiteId);
      for(const [id,item] of jobNodes)if(!jobs.some(j=>j.id===id)){item.node.remove();jobNodes.delete(id);}
      for(const job of jobs) {
        let item=jobNodes.get(job.id);
        if(!item) {
          const progress=el('progress',{max:1,value:0,'aria-label':`${data.production.plants[job.plantId].name} batch progress`}), note=el('p',{class:'lt-note'});
          const cancel=el('button',{class:'btn btn-small',onClick:()=>{
            if(notify(game.actions.cancelProduction(job.id)))feedback?.message('Batch cancelled. Feed returned; operating cost retained.','good');
            refreshSection();
          }},'Cancel batch');
          const n=el('article',{class:'lt-card qo-job',dataset:{jobId:job.id}},
            el('div',{class:'qo-plant-head'},el('h3',{},data.production.plants[job.plantId].name),cancel),progress,note);
          item={node:n,progress,note};jobNodes.set(job.id,item);running.append(n);
        }
        item.progress.value=1-job.remainingHours/job.hours;
        setText(item.note,`${tonnes(job.tonnes)} · ${stockpileConfig(ctx,job.sourceBay).name} → ${stockpileConfig(ctx,job.outputBay).name} · ${job.blocked?'Waiting for bay space':`${timeText(job.remainingHours)} remaining`}`);
      }
      for(const update of formRefresh)update();
    };
  }

  function history() {
    const list=el('div',{class:'qo-reports'});
    body.append(heading('Recent batches',`The latest ${data.production.historyLimit} completed or cancelled batches are saved. Plan again restores the recipe, bays and amount; review today's quote before starting. Valid batch plans also stay saved when you leave the laptop.`),list);
    let key='';
    refreshSection=()=>{
      const entries=[...game.state.production.history].filter(e=>e.siteId===game.state.currentSiteId).reverse();
      const k=JSON.stringify(entries);if(k===key)return;key=k;clear(list);
      if(!entries.length)list.append(el('p',{class:'lt-note'},'No batches finished yet. Completed and cancelled batches will appear here.'));
      const bay=id=>stockpileConfig(ctx,id)?.name??id;
      for(const entry of entries) {
        const completed=entry.status==='completed';
        const time=`Day ${entry.day} · ${String(entry.hour).padStart(2,'0')}:${String(entry.minute).padStart(2,'0')}`;
        list.append(el('article',{class:'lt-card qo-history',dataset:{batchId:entry.id}},
          el('div',{class:'qo-plant-head'},el('h3',{},data.production.plants[entry.plantId]?.name??entry.plantId),
            el('b',{class:completed?'up':'qo-plant-state'},completed?'Completed':'Cancelled')),
          el('p',{class:'lt-note'},`${time} · ${tonnes(entry.tonnes)} · ${data.production.recipes[entry.recipeId]?.name??entry.recipeId}`),
          el('p',{},completed?`${materialsText(data,entry.output)} → ${bay(entry.outputBay)}`:`${tonnes(entry.returnedTonnes)} feed returned to ${bay(entry.sourceBay)}`),
          completed&&pileTotal(entry.rejects)>0?el('p',{class:'lt-note'},`Retained in ${bay(entry.sourceBay)}: ${materialsText(data,entry.rejects)}`):null,
          el('div',{class:'qo-actions'},el('span',{class:'lt-note'},`${money(entry.cost)} operating cost${completed?'':' · not refunded'}`),
            el('button',{class:'btn btn-small',onClick:()=>{
              if(notify(game.actions.saveProductionPlan(entry)))show('production');
            }},'Plan again'))));
      }
    };
  }

  function survey() {
    const grid=el('div',{class:'qo-area-grid'}), detail=el('div',{class:'lt-card qo-survey'});
    body.append(heading('Choose where to work','Nine borehole samples per area estimate the remaining layers above bedrock. These are approximate reserves, not guaranteed yields. Deposited heaps and compacted fill are included; intact bedrock needs a breaker.'),grid,detail);
    let selected=activeWorkArea(ctx)?.id??workAreas(ctx)[0]?.id;
    for(const area of workAreas(ctx)) {
      grid.append(el('button',{class:'qo-area',dataset:{areaId:area.id},onClick:()=>{selected=area.id;render();}},area.name));
    }
    const render=()=>{
      const s=surveyWorkArea(ctx,selected);clear(detail);
      for(const b of grid.children)b.setAttribute('aria-pressed',String(b.dataset.areaId===selected));
      if(!s){detail.append('No field survey is available.');return;}
      const active=activeWorkArea(ctx)?.id===selected;
      detail.append(el('h3',{},s.name),el('p',{class:'lt-note'},`${Math.round(s.area).toLocaleString()} m² · cover ${s.coverDepth.toFixed(2)} m · bedrock ${s.shallowest.toFixed(1)}–${s.deepest.toFixed(1)} m below the surface`),
        el('div',{class:'qo-reserves'},Object.entries(s.estimates).map(([id,t])=>el('div',{},el('span',{},data.materials[id]?.name??id),el('b',{},`≈ ${Math.round(t).toLocaleString()} t`)))),
        el('p',{class:'lt-note'},'Strip and store valuable topsoil separately. Leave room for a haul ramp and keep clay out of clean aggregate bays.'),
        el('div',{class:'qo-actions'},el('button',{class:'btn btn-primary',onClick:()=>{notify(game.actions.setWorkArea(selected));render();}},active?'Follow this work area':'Set as work area'),
          el('button',{class:'lt-link',onClick:()=>render()},'Refresh survey'),
          el('button',{class:'lt-link',onClick:()=>{game.actions.setWorkArea(null);render();}},'Follow current goal')),
        el('p',{class:'lt-note'},active?'Selected: marked on your map and in the field. Choosing a machine waypoint replaces this guide.':'Setting an area changes the guide, not your selected machine.'));
    };
    refreshSection=()=>{};render();
  }

  function reports() {
    const list=el('div',{class:'qo-reports'});
    body.append(heading('Your working days','Income and running costs come from your existing company logbook. Investment is shown separately; loans and developer adjustments are excluded from trading.'),list);
    let key='';
    refreshSection=()=>{
      const days=[...(game.state.logbook?.days??[])].slice(-7).reverse();
      const k=JSON.stringify(days);if(key===k)return;key=k;clear(list);
      if(!days.length)list.append(el('p',{class:'lt-note'},'Your first report starts when the company earns or spends money.'));
      for(const d of days) {
        const stats=[['Income',money(d.income)],['Running costs',money(d.spending)],['Net investment',money(d.invested??0)],
          ['Dug',tonnes(d.tonnesDug)],['Sold',tonnes(d.tonnesSold)],['Processed',tonnes(d.processed??0)],['Deliveries',String(d.loads)],['Batches',String(d.productionBatches??0)]];
        const grid=el('div',{class:'qo-report-grid'},stats.map(([label,value])=>el('div',{},el('span',{},label),el('b',{},value))));
        list.append(el('article',{class:'lt-card qo-report'},
          el('div',{class:'qo-plant-head'},el('h3',{},`Day ${d.day}${d.day===getDate(game.state,data).day?' · Today':''}`),
            el('b',{class:d.income>=d.spending?'up':'down'},`${signedMoney(d.income-d.spending)} trading`)),grid));
      }
    };
  }

  function show(id) {
    section=id;clear(tabs);clear(body);
    for(const [key,label] of [['yard','Yard'],['production','Production'],['history','Batch history'],['survey','Work areas'],['reports','Daily reports']]) {
      tabs.append(el('button',{class:`lt-chip ${section===key?'active':''}`,'aria-pressed':String(section===key),onClick:()=>show(key)},label));
    }
    ({yard,production,history,survey,reports})[section]();refreshSection();
  }
  show(section);
  return {node,refresh:()=>refreshSection(),headSet:true};
}
