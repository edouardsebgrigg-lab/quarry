import { el, clear, setText } from '../../dom.js';
import { money, tonnes } from '../../format.js';
import { activeBlast } from '../../../blasting/index.js';

const stages={drilling:'Drilling',drilled:'Drilled · awaiting charging crew',charging:'Charging',ready:'Ready to fire',countdown:'Countdown'};
const minutes=h=>`${Math.max(1,Math.ceil(h*60))} game min`;

export function blastingPanel({game,world,feedback}) {
  const {data,ctx}=game,ground=ctx.ground;
  const node=el('div',{class:'qo-blasting'});
  node.append(el('div',{class:'qo-intro'},el('h3',{},'Open the rock, then work the rubble'),
    el('p',{class:'lt-note'},'Strip the surface to bedrock with your digger. Book a contractor cut, let the crew drill and charge it, then move yourself and your equipment beyond the orange boundary. Firing leaves loose rock on the field for your bucket and crusher.')));
  if(!ground){node.append(el('p',{},'No quarry field is available here.'));return {node,refresh(){},dispose(){}};}
  const notify=r=>{if(!r.ok)feedback?.message(r.reason,'warn');return r.ok;};
  const here=world?.blastPoint?.()??{x:ground.x0+ground.nx*ground.cellSize/2,z:ground.z0+ground.nz*ground.cellSize/2};
  const x=el('input',{id:'blast-x',class:'text-input',type:'number',step:.5,value:here.x.toFixed(2)});
  const z=el('input',{id:'blast-z',class:'text-input',type:'number',step:.5,value:here.z.toFixed(2)});
  const pattern=el('select',{id:'blast-pattern',class:'lt-select'},Object.entries(data.blasting.patterns).map(([id,p])=>el('option',{value:id},p.name)));
  const field=(title,id,n)=>el('label',{class:'qo-field',for:id},title,n);
  const request=()=>({x:Number(x.value),z:Number(z.value),patternId:pattern.value});
  const map=el('canvas',{class:'qo-blast-map',width:320,height:320,'aria-label':'Quarry field: click to choose a rock cut. Coordinate fields also set the location.'});
  const quote=el('div',{class:'qo-quote','aria-live':'polite'});
  const book=el('button',{class:'btn btn-primary',onClick:()=>{if(notify(game.actions.startBlast(request())))feedback?.message('Drilling crew booked. Your cut is marked in the field.','good');refresh(true);}},'Book drilling');
  const survey=el('article',{class:'lt-card qo-blast-survey'},el('h3',{},'Survey a cut'),map,
    el('p',{class:'lt-note'},'Green/brown: cover · grey: exposed rock · amber: loose material. Click the field, enter coordinates, or use your survey point.'),
    el('div',{class:'qo-form'},field('East / X','blast-x',x),field('South / Z','blast-z',z),field('Cut size','blast-pattern',pattern)),
    el('div',{class:'qo-actions'},el('button',{class:'btn btn-small',onClick:()=>{const p=world?.blastPoint?.();if(p){x.value=p.x.toFixed(2);z.value=p.z.toFixed(2);refresh(true);}}},'Use field survey / position')),
    el('p',{class:'lt-note'},'Use the material survey in the field to aim at a point before opening the laptop. With no survey active, this uses where you are standing.'),quote,book);
  const status=el('h3'),detail=el('p',{class:'lt-note'}),progress=el('progress',{max:1,'aria-label':'Rock cut preparation'}),
    clearance=el('p',{class:'lt-note','aria-live':'polite'}),hold=el('p',{class:'qo-reason'});
  const action=fn=>()=>{const p=activeBlast(ctx);if(p)notify(fn(p.id));refresh(true);};
  const charge=el('button',{class:'btn btn-primary',onClick:action(game.actions.chargeBlast)},'Book charging');
  const fire=el('button',{class:'btn btn-primary',onClick:action(game.actions.fireBlast)},'Start countdown');
  const abort=el('button',{class:'btn btn-primary',onClick:action(game.actions.abortBlast)},'Stop countdown');
  const cancel=el('button',{class:'btn btn-small',onClick:action(game.actions.cancelBlast)},'Cancel cut');
  const active=el('article',{class:'lt-card qo-blast-active',dataset:{blastActive:true}},status,progress,detail,clearance,hold,
    el('div',{class:'qo-actions'},charge,fire,abort,cancel),el('p',{class:'lt-note'},'Paid crew work is not refunded. An interrupted countdown returns to Ready and needs a new firing command.'));
  const history=el('div',{class:'qo-reports'}),totals=el('p',{class:'lt-note'});
  node.append(el('div',{class:'qo-blast-layout'},survey,el('div',{class:'qo-blast-right'},active,el('article',{class:'lt-card'},el('h3',{},'Cut records'),totals,history))));
  let lastQuote='',historyKey='',lastCheck=0,lastMap='';
  function drawMap() {
    const c=map.getContext('2d'),size=map.width,span=ground.nx*ground.cellSize,depth=ground.nz*ground.cellSize;
    c.clearRect(0,0,size,size);
    // Display samples only; the authoritative quote checks every terrain cell in the cut.
    for(let j=0;j<64;j++)for(let i=0;i<64;i++) {
      const column=ground.inspectAt(ground.x0+(i+.5)/64*span,ground.z0+(j+.5)/64*depth);
      c.fillStyle=column.surface.loose?'#c39a52':column.bedrockDepth<=data.blasting.maximumCover?'#a2acaf':column.surface.coverMaterial==='topsoil'?'#53624a':'#806b50';
      c.fillRect(i*5,j*5,5,5);
    }
    const p=activeBlast(ctx),r=request(),cfg=data.blasting.patterns[r.patternId],at=p?.spec??{...r,radius:cfg.radius};
    const px=(at.x-ground.x0)/span*size,pz=(at.z-ground.z0)/depth*size;
    if(Number.isFinite(px)&&Number.isFinite(pz)) {
      for(const [radius,color] of [[at.radius+data.blasting.clearance,'#f4a766'],[at.radius,'#ffe48a']]){
        c.beginPath();c.ellipse(px,pz,radius/span*size,radius/depth*size,0,0,Math.PI*2);c.strokeStyle=color;c.lineWidth=2;c.stroke();
      }
      c.fillStyle='#fff';c.fillRect(px-2,pz-2,4,4);
    }
    const me=world?.mapInfo?.().you;
    if(me){c.fillStyle='#83d9ff';c.beginPath();c.arc((me.x-ground.x0)/span*size,(me.z-ground.z0)/depth*size,3,0,Math.PI*2);c.fill();}
  }
  map.addEventListener('click',e=>{const rect=map.getBoundingClientRect();x.value=(ground.x0+(e.clientX-rect.left)/rect.width*ground.nx*ground.cellSize).toFixed(2);z.value=(ground.z0+(e.clientY-rect.top)/rect.height*ground.nz*ground.cellSize).toFixed(2);refresh(true);});
  for(const control of [x,z,pattern])control.addEventListener('input',()=>refresh(true));
  function refresh(force=false) {
    const p=activeBlast(ctx),now=performance.now();
    if(force||now-lastCheck>500) {
      lastCheck=now;const q=game.actions.quoteBlast(request()),k=JSON.stringify([q.reason,q.tonnes,q.patternId,q.cost,q.affordable,q.spec]);
      if(k!==lastQuote||force) {
        lastQuote=k;clear(quote);
        quote.append(el('p',{class:q.valid?'lt-note':'qo-reason'},q.reason??'Survey ready · exposed rock'),
          q.tonnes>0?el('div',{},el('span',{},'Rock released'),el('b',{},tonnes(q.tonnes))):null,
          el('div',{},el('span',{},'Drilling'),el('b',{},`${money(q.drillCost)} · ${minutes(q.drillHours)}`)),
          el('div',{},el('span',{},'Charging later'),el('b',{},`${money(q.chargeCost)} · ${minutes(q.chargeHours)}`)),
          el('p',{class:'lt-note'},`Total crew cost ${money(q.cost)} · ${q.clearance} m clearance from the centre. Keep the drilled ground unchanged until firing.`));
        world?.setBlastPreview?.(Number.isFinite(q.spec?.x)&&Number.isFinite(q.spec?.z)?q.spec:null);
      }
      book.disabled=!q.ok;setText(book,`Book drilling · ${money(q.drillCost)}`);
    }
    active.hidden=!p;
    if(p) {
      setText(status,`${p.name} · ${stages[p.stage]}`);
      const timed=p.stage==='drilling'||p.stage==='charging';progress.hidden=!timed&&p.stage!=='countdown';
      progress.value=timed?1-p.remainingHours/p.hours:p.stage==='countdown'?1-p.remainingSeconds/p.countdownSeconds:1;
      setText(detail,`${tonnes(p.estimatedTonnes)} planned · ${money(p.cost)} spent · X ${p.spec.x.toFixed(1)}, Z ${p.spec.z.toFixed(1)}${timed?` · ${minutes(p.remainingHours)} remaining`:p.stage==='countdown'?` · ${Math.ceil(p.remainingSeconds)} seconds`:''}`);
      const c=game.actions.blastClearance(p.id);
      setText(clearance,c.ok?`Field clear · stay beyond the ${p.clearance} m boundary`:c.reason);
      setText(hold,p.holdReason??'');hold.hidden=!p.holdReason;
      charge.hidden=p.stage!=='drilled';charge.disabled=game.state.money<p.chargeCost;setText(charge,`Book charging · ${money(p.chargeCost)}`);
      fire.hidden=p.stage!=='ready';fire.disabled=!c.ok;abort.hidden=p.stage!=='countdown';
    }
    const s=game.state.blasting,key=JSON.stringify(s.history);
    setText(totals,`${s.fired} cuts fired · ${tonnes(s.releasedTonnes)} loosened. Excavation and sales are counted when you actually handle the material.`);
    if(key!==historyKey){historyKey=key;clear(history);for(const h of [...s.history].filter(h=>h.siteId===game.state.currentSiteId).reverse())history.append(el('div',{class:'qo-blast-record'},el('b',{},`${h.name} · ${h.status==='fired'?'Fired':'Cancelled'}`),el('p',{class:'lt-note'},`Day ${h.day} · ${tonnes(h.tonnes)} released · ${money(h.cost)} crew cost`)));if(!history.children.length)history.append(el('p',{class:'lt-note'},'Completed and cancelled cuts appear here.'));}
    const mapKey=JSON.stringify([request(),p?.id,p?.stage,s.fired,s.history.length]);
    if(force||lastMap!==mapKey){lastMap=mapKey;drawMap();}
  }
  refresh(true);
  return {node,refresh,dispose:()=>world?.setBlastPreview?.(null)};
}
