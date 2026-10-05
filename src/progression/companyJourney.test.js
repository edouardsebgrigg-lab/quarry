// Domain journey, not a human playthrough: positioning/hauls are represented by actions
// and fixed clock intervals. All money is earned and all cargo comes from real ground.
// Calendar costs, fuel, wear, repairs, sale grades and rewards remain enabled.
import {it,expect} from 'vitest';
import {createGame} from '../game/index.js';
import {currentObjective,journeyJournal} from './index.js';
import {pileTotal} from '../quarry/index.js';
import {bucketFill} from '../machinery/digging.js';
import {getStats,machinePrice} from '../machinery/index.js';
import {loadCarrier,cargoRoom} from '../machinery/trailers.js';
import {careerMetric} from '../career/index.js';
import {barrowFill} from '../handtools/index.js';
import {createSaveSystem,createMemoryStorage,migrations} from '../core/index.js';
import {validateSavedGame} from '../game/saveValidation.js';

it('earns its way from the shovel through every guided goal and continues after a mid-career save',()=>{
  let g=createGame({seed:207}),spot=0,trips=0,cuts=0;
  const initialMaterials=g.ctx.ground.totals(),soldMaterials={},costs={};
  const saves=createSaveSystem({storage:createMemoryStorage(),version:g.data.game.saveVersion,migrations,validateState:state=>validateSavedGame(g.data,state)});
  const monitor=()=>g.events.on('moneyChanged',e=>{if(e.amount<0)costs[e.reason]=(costs[e.reason]??0)-e.amount;});
  monitor();
  const pickupId=g.state.machines[0].id;
  let diggerId=null,carrierId=pickupId,restored=false;
  const machine=id=>g.state.machines.find(m=>m.id===id);
  const ok=r=>{expect(r.ok,r.reason).toBe(true);return r;};
  const step=()=>currentObjective(g.ctx)?.id;
  const advance=seconds=>g.advance(Math.ceil(seconds*g.data.game.ticksPerSecond));
  const finish=id=>{let guard=0;while(machine(id).job&&guard++<10000)g.tick();expect(machine(id).job).toBeNull();};
  const nextSpot=()=>{expect(spot).toBeLessThan(4096);const i=spot++;return {x:5.25+(i%64)*2.2,z:5.25+Math.floor(i/64)*2.2};};
  const maintain=id=>{
    const m=machine(id);
    if(m.broken||m.condition<45){ok(g.actions.selectMachine(id));ok(g.actions.serviceOrRepair());finish(g.state.machines.find(m=>m.job)?.id??id);}
  };
  const sell=()=>{
    maintain(carrierId);advance(120); // outbound journey, without claiming physical driving
    const delivered={...loadCarrier(g.ctx,machine(carrierId)).load};
    ok(g.actions.weighIn(carrierId));ok(g.actions.tip(carrierId,{bay:'topsoil'}));finish(carrierId);
    for(const [material,tonnes] of Object.entries(delivered))soldMaterials[material]=(soldMaterials[material]??0)+tonnes;
    expect(pileTotal(loadCarrier(g.ctx,machine(carrierId)).load)).toBe(0);
    advance(120);trips++;
  };
  const fillAndSell=()=>{
    let guard=0;
    while(cargoRoom(g.ctx,machine(carrierId),{topsoil:1})>.03&&guard++<1000){
      maintain(diggerId);const m=machine(diggerId),stats=getStats(g.data,m);
      let bites=0;
      while(!bucketFill(g.ctx.ground,stats,m.load).full&&bites++<100){
        const at=nextSpot(),y=g.ctx.ground.heightAt(at.x,at.z);
        const volumeBefore=g.ctx.ground.looseVolume(m.load);
        const r=ok(g.actions.bucketCut(m.id,{...at,from:{x:at.x+1.3,y:y-.10,z:at.z},to:{x:at.x,y:y-.20,z:at.z},attack:1}));
        expect(r.tonnes).toBeGreaterThan(0);cuts++;
        advance(stats.cycleTime*Math.max(.05,(g.ctx.ground.looseVolume(m.load)-volumeBefore)/stats.bucketVolume));
        if(m.broken)maintain(diggerId);
      }
      expect(bites).toBeLessThan(101);
      ok(g.actions.dumpBucket(m.id,{machineId:carrierId}));
      if(pileTotal(m.load)>0)break; // carrier full: keep the genuine remainder aboard
    }
    expect(guard).toBeLessThan(1000);sell();
  };
  const earnFor=price=>{let guard=0;while(g.state.money<price+30&&guard++<120)fillAndSell();expect(g.state.money).toBeGreaterThanOrEqual(price);};
  const buy=(type,tier)=>{const price=machinePrice(g.ctx,type,tier);earnFor(price);return ok(g.actions.buyMachine(type,tier)).machine.id;};

  // The barrow lesson and first delivery use only shovelfuls from the field.
  for(let loads=0;pileTotal(machine(pickupId).load)<.32&&loads<8;loads++){
    for(let i=0;barrowFill(g.ctx)<.95&&i<20;i++){
      if(!pileTotal(g.state.tools.shovel.load))ok(g.actions.shovelDig(nextSpot()));
      ok(g.actions.shovelDump({into:'barrow'}));advance(g.data.tools.shovel.digTime+g.data.tools.shovel.dumpTime);
    }
    ok(g.actions.tipBarrow({machineId:pickupId}));
  }
  expect(step()).toBe('weighIn');sell();
  ok(g.actions.buyMod(pickupId,'stifferSprings'));
  diggerId=ok(g.actions.buyMachine('miniDigger','micro08')).machine.id;
  fillAndSell();expect(step()).toBe('buyTractor');
  const tractorId=buy('tractor','yard35'),trailerId=buy('trailer','yardTipper');
  ok(g.actions.attachTrailer(tractorId,trailerId));carrierId=tractorId;
  fillAndSell();expect(step()).toBe('buildWorks');
  earnFor(100);ok(g.actions.buildWorks({mode:'level',ax:30,az:120,bx:38,bz:120,width:8}));
  diggerId=buy('excavator','utility80');carrierId=buy('truck','rusty');
  fillAndSell();
  for(let guard=0;step()&&guard<200;guard++){
    if(step()==='yardBuilding'){
      earnFor(g.data.buildings.workshop.price);ok(g.actions.buyBuilding('workshop'));
    } else fillAndSell();
    if(!restored&&careerMetric(g.ctx,'cleanTonnes')>=100){
      const money=g.state.money,sold=g.state.stats.tonnesSold;
      saves.save('slot1',g.snapshot());g=createGame({data:g.data,state:saves.load('slot1')});monitor();restored=true;
      expect(g.state.money).toBe(money);expect(g.state.stats.tonnesSold).toBe(sold);
    }
  }
  expect(step()).toBeUndefined();expect(restored).toBe(true);
  expect(careerMetric(g.ctx,'cleanTonnes')).toBeGreaterThanOrEqual(500);
  expect(journeyJournal(g.ctx).every(s=>s.status==='completed'&&!s.record.legacy)).toBe(true);
  expect(g.state.contracts.done??0).toBe(0); // customer orders are genuinely optional
  const record=structuredClone(g.state.objectives.completion),balance=g.state.money;
  saves.save('slot1',g.snapshot());saves.importSave('slot2',saves.exportSave('slot1'));
  g=createGame({data:g.data,state:saves.load('slot2')});monitor();
  expect(g.state.objectives.completion).toEqual(record);
  ok(g.actions.selectMachine(diggerId));expect(g.state.money).toBe(balance);
  fillAndSell();expect(g.state.objectives.completion).toEqual(record);
  const inventory=g.ctx.ground.totals();
  for(const load of [...g.state.machines.map(m=>m.load),g.state.tools.shovel.load,g.state.tools.barrow.load,soldMaterials]) {
    for(const [material,tonnes] of Object.entries(load))inventory[material]=(inventory[material]??0)+tonnes;
  }
  for(const [material,tonnes] of Object.entries(initialMaterials))expect(inventory[material],material).toBeCloseTo(tonnes,3);
  expect(costs.fuel).toBeGreaterThan(0);expect(costs.service).toBeGreaterThan(0);expect(costs.insurance).toBeGreaterThan(0);
  expect(g.state.money).toBeGreaterThan(0);expect(g.state.stats.fuelSpent).toBeGreaterThan(0);
  console.log('Company journey',JSON.stringify({trips,cuts,money:g.state.money,sold:g.state.stats.tonnesSold,clean:careerMetric(g.ctx,'cleanTonnes'),costs,completion:record}));
},120000);
