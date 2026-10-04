import { describe, it, expect } from 'vitest';
import { createGame } from '../game/index.js';
import { loadData, ticksPerHour } from '../core/index.js';
import { stockpileLoad, stockpileRoom, storeStockpile } from '../buildings/index.js';
import { pileTotal } from '../quarry/index.js';
import { bestDeliveryQuote } from '../economy/index.js';
import { tickJobs } from '../machinery/index.js';

function setup() {
  const data = loadData(); data.milestones.list = [];
  const game = createGame({ data, seed: 3 }); game.state.money = 10000;
  for (const id of ['stockpiles','crusher','screener']) expect(game.actions.buyBuilding(id).ok).toBe(true);
  return game;
}
const crush = (tonnes = 2) => ({ plantId: 'crusher', recipeId: 'crushRock', sourceBay: 'west', outputBay: 'middle', tonnes });
const screen = (tonnes = 2) => ({ plantId: 'screener', recipeId: 'screenGravel', sourceBay: 'west', outputBay: 'east', tonnes });
const finish = game => game.advance(Math.ceil(Math.max(...game.state.production.jobs.map(j => j.remainingHours)) * ticksPerHour(game.data)) + 2);
const inventory = game => game.data.buildings.stockpiles.bays.reduce((t,b) => t+pileTotal(stockpileLoad(game.ctx,b.id)),0)
  + game.state.production.jobs.reduce((t,j) => t+pileTotal(j.input),0);

describe('paid, conserved quarry production', () => {
  it('accepts rock extracted from the actual finite bedrock, with no fabricated feed', () => {
    const g=setup(),ground=g.ctx.ground;
    const soil=g.actions.digGround({x:120,z:100,radius:4,bottomY:-100});
    g.actions.dumpGround({x:135,z:125,tonnes:soil.tonnes,radius:4});
    let extracted=0;
    for(let i=0;i<12;i++) {
      const x=120.25,z=100.25,y=ground.heightAt(x,z);
      const cut=ground.cutSweep({from:{x,y:y+.01,z},to:{x,y:y-.3,z},width:.5,maxTonnes:2-extracted,tool:'breaker',force:1000});
      extracted+=cut.tonnes.rock??0;
      const other={...cut.tonnes};delete other.rock;g.actions.dumpGround({x:135,z:125,tonnes:other,radius:4});
    }
    expect(extracted).toBeGreaterThan(.5);
    expect(storeStockpile(g.ctx,'west',{rock:extracted}).ok).toBe(true);
    expect(g.actions.startProduction(crush(Math.min(1,extracted))).ok).toBe(true);
  });
  it('requires bays before commissioning a plant and never charges a refused purchase', () => {
    const g = createGame(); g.state.money = 10000;
    expect(g.actions.buyBuilding('crusher').reason).toMatch(/stockpile/);
    expect(g.state.money).toBe(10000);
  });
  it('quotes current depot values without changing the feed, save, time or balance', () => {
    const g = setup(); storeStockpile(g.ctx,'west',{rock:5});
    const before = JSON.stringify(g.snapshot()), q = g.actions.quoteProduction(crush());
    expect(q.ok).toBe(true); expect(q.output).toEqual({gravel:1.6,sand:0.4});
    expect(q.inputValue).toBeCloseTo(bestDeliveryQuote(g.ctx,{rock:2}).gross);
    expect(q.outputValue).toBeGreaterThan(0); expect(q.cost).toBe(2);
    expect(JSON.stringify(g.snapshot())).toBe(before);
  });
  it('charges once, holds actual rock and produces every tonne without any sale or digging reward', () => {
    const g = setup(); storeStockpile(g.ctx,'west',{rock:5});
    const money = g.state.money, stats = { ...g.state.stats }, sold=[];
    g.events.on('productSold',e => sold.push(e));
    expect(g.actions.startProduction(crush()).ok).toBe(true);
    expect(inventory(g)).toBeCloseTo(5); expect(g.state.money).toBe(money-2);
    expect(stockpileLoad(g.ctx,'middle')).toEqual({});
    finish(g);
    expect(stockpileLoad(g.ctx,'west')).toEqual({rock:3});
    expect(stockpileLoad(g.ctx,'middle')).toEqual({gravel:1.6,sand:0.4});
    expect(inventory(g)).toBeCloseTo(5); expect(g.state.production.processed).toBe(2);
    expect(g.state.production.batches).toBe(1); expect(sold).toEqual([]);
    expect(g.state.stats.tonnesSold).toBe(stats.tonnesSold); expect(g.state.stats.tonnesDug).toBe(stats.tonnesDug);
  });
  it('screens only the requested existing material and returns every rejected material', () => {
    const g = setup(); storeStockpile(g.ctx,'west',{gravel:4,sand:4,clay:2});
    expect(g.actions.startProduction(screen(5)).ok).toBe(true); expect(inventory(g)).toBeCloseTo(10);
    finish(g);
    expect(stockpileLoad(g.ctx,'east')).toEqual({gravel:2});
    expect(stockpileLoad(g.ctx,'west')).toEqual({gravel:2,sand:4,clay:2});
    expect(inventory(g)).toBeCloseTo(10);
  });
  it('refuses contamination, empty feed, unknown recipes, same bays and invalid batch sizes atomically', () => {
    const g = setup(); storeStockpile(g.ctx,'west',{rock:4,clay:1});
    for (const request of [null, undefined, crush(), {...crush(),recipeId:'screenSand'}, {...screen(),sourceBay:'bad'}, {...screen(),outputBay:'west'},
      {...screen(),tonnes:NaN}, {...screen(),tonnes:-1}, {...screen(),tonnes:Infinity}, {...screen(),tonnes:0.01}, {...screen(),tonnes:100}]) {
      const before = JSON.stringify(g.snapshot()); expect(g.actions.startProduction(request).ok).toBe(false); expect(JSON.stringify(g.snapshot())).toBe(before);
    }
  });
  it('refuses insufficient cash and absent target material without charging or removing tonnes', () => {
    const g = setup(); storeStockpile(g.ctx,'west',{rock:2});
    expect(g.actions.startProduction(screen()).reason).toMatch(/no gravel/);
    g.state.money = 0; expect(g.actions.startProduction(crush()).reason).toMatch(/money/);
    expect(stockpileLoad(g.ctx,'west')).toEqual({rock:2});
  });
  it('reserves both product space and enough feed space to cancel safely', () => {
    const g = setup(); storeStockpile(g.ctx,'west',{rock:10});
    const r = g.actions.startProduction(crush());
    expect(stockpileRoom(g.ctx,'west')).toBeCloseTo(15); expect(stockpileRoom(g.ctx,'middle')).toBeCloseTo(23);
    expect(storeStockpile(g.ctx,'middle',{sand:24}).ok).toBe(false);
    expect(storeStockpile(g.ctx,'west',{rock:15}).ok).toBe(true);
    const money = g.state.money;
    expect(g.actions.cancelProduction(r.jobId).returnedTonnes).toBe(2);
    expect(stockpileLoad(g.ctx,'west')).toEqual({rock:25}); expect(g.state.money).toBe(money);
    expect(stockpileRoom(g.ctx,'middle')).toBe(25); expect(g.actions.cancelProduction(r.jobId).ok).toBe(false);
  });
  it('rejects a full output bay and capacity held by a vehicle tipping into it', () => {
    const g = setup(); storeStockpile(g.ctx,'west',{rock:2}); storeStockpile(g.ctx,'middle',{sand:23});
    const truck = g.state.machines[0]; truck.load={sand:0.5};
    expect(g.actions.tip(truck.id,{stockpileBay:'middle'}).ok).toBe(true);
    expect(g.actions.startProduction(crush()).reason).toMatch(/space/);
    expect(stockpileLoad(g.ctx,'west')).toEqual({rock:2});
  });
  it('prevents vehicle tips from claiming a running plant’s reserved output', () => {
    const g = setup(); storeStockpile(g.ctx,'west',{rock:2}); storeStockpile(g.ctx,'middle',{sand:23});
    expect(g.actions.startProduction(crush()).ok).toBe(true);
    const truck=g.state.machines[0]; truck.load={sand:0.5};
    expect(g.actions.tip(truck.id,{stockpileBay:'middle'}).reason).toMatch(/full/);
    finish(g); expect(pileTotal(stockpileLoad(g.ctx,'middle'))).toBeCloseTo(25);
  });
  it('allows different plants concurrently, but refuses a second batch on the same plant', () => {
    const g = setup(); storeStockpile(g.ctx,'west',{rock:4}); storeStockpile(g.ctx,'east',{gravel:1,sand:1});
    expect(g.actions.startProduction(crush()).ok).toBe(true);
    expect(g.actions.startProduction(crush()).reason).toMatch(/already/);
    expect(g.actions.startProduction({...screen(),sourceBay:'east',outputBay:'middle'}).ok).toBe(true);
    expect(stockpileRoom(g.ctx,'middle')).toBeCloseTo(22); finish(g);
    expect(inventory(g)).toBeCloseTo(6); expect(g.state.production.batches).toBe(2);
  });
  it('holds incomplete work unchanged until game ticks run, and resumes after save/load', () => {
    const g = setup(); storeStockpile(g.ctx,'west',{rock:4}); g.actions.startProduction(crush());
    g.advance(5); const saved=JSON.parse(JSON.stringify(g.snapshot()));
    const reloaded=createGame({state:saved,data:g.data});
    expect(reloaded.state.production.jobs[0].remainingHours).toBe(g.state.production.jobs[0].remainingHours);
    expect(stockpileRoom(reloaded.ctx,'middle')).toBe(23); finish(reloaded);
    expect(inventory(reloaded)).toBeCloseTo(4); expect(reloaded.state.production.batches).toBe(1);
    reloaded.advance(5); expect(reloaded.state.production.batches).toBe(1);
  });
  it('defaults old saves without giving them plants, feed, processed tonnes or rewards', () => {
    const g=createGame(); const saved=JSON.parse(JSON.stringify(g.snapshot())); delete saved.production;
    const reloaded=createGame({state:saved}); expect(reloaded.state.production.jobs).toEqual([]);
    expect(reloaded.state.production.processed).toBe(0); expect(reloaded.state.buildings).toEqual({});
  });
  it('records operating costs and completed tonnes in the existing daily report', () => {
    const g=setup(); storeStockpile(g.ctx,'west',{rock:2});
    const before=g.state.logbook.days.at(-1).spending; g.actions.startProduction(crush()); finish(g);
    const day=g.state.logbook.days.at(-1); expect(day.spending-before).toBeCloseTo(2);
    expect(day.processed).toBe(2); expect(day.productionBatches).toBe(1);
  });
  it('rewards the first completed batch once and preserves that award across save/load', () => {
    const g=setup();g.data.milestones.list=loadData().milestones.list.filter(m=>m.group==='production');
    storeStockpile(g.ctx,'west',{rock:4});const money=g.state.money;
    g.actions.startProduction(crush());finish(g);
    expect(g.state.money).toBe(money-2+60);expect(g.state.career.reached.batch1).toBeDefined();
    const loaded=createGame({state:JSON.parse(JSON.stringify(g.snapshot())),data:g.data});
    loaded.actions.startProduction(crush());finish(loaded);
    expect(loaded.state.money).toBe(money-4+60);expect(loaded.state.production.batches).toBe(2);
  });

  it('keeps plans across saves without reserving feed or spending, and rechecks current conditions at start', () => {
    const g=setup(), cash=g.state.money;
    const request={...crush(3),cost:0,output:{gravel:100}};
    expect(g.actions.saveProductionPlan(request).ok).toBe(true);
    expect(g.state.production.jobs).toEqual([]);expect(g.state.money).toBe(cash);
    expect(stockpileRoom(g.ctx,'middle')).toBe(25);
    const loaded=createGame({data:g.data,state:JSON.parse(JSON.stringify(g.snapshot()))});
    const plan=loaded.state.production.plans.home.crusher;
    expect(plan).toEqual(crush(3));
    expect(loaded.actions.startProduction(plan).reason).toMatch(/Not enough material/);
    storeStockpile(loaded.ctx,'west',{rock:3});
    loaded.data.production.plants.crusher.costPerTonne=2;
    expect(loaded.actions.startProduction(plan).ok).toBe(true);
    expect(loaded.state.money).toBe(cash-6);
  });

  it('refuses invalid plans atomically and keeps separate plans for each plant', () => {
    const g=setup();g.actions.saveProductionPlan(crush(3));g.actions.saveProductionPlan(screen(4));
    const before=JSON.stringify(g.snapshot());
    for(const request of [null,{}, {...crush(),plantId:'missing'}, {...crush(),recipeId:'screenSand'},
      {...crush(),outputBay:'west'}, {...crush(),sourceBay:'missing'}, {...crush(),tonnes:NaN},crush(100)]) {
      expect(g.actions.saveProductionPlan(request).ok).toBe(false);
      expect(JSON.stringify(g.snapshot())).toBe(before);
    }
    expect(g.state.production.plans.home.crusher).toEqual(crush(3));
    expect(g.state.production.plans.home.screener).toEqual(screen(4));
  });

  it('records completed and cancelled receipts once, with retained cost and actual output destinations', () => {
    const g=setup();storeStockpile(g.ctx,'west',{rock:4});
    const first=g.actions.startProduction(crush()).jobId;finish(g);
    const receipt=structuredClone(g.state.production.history[0]);
    expect(receipt).toMatchObject({id:first,status:'completed',cost:2,sourceBay:'west',outputBay:'middle',output:{gravel:1.6,sand:.4}});
    const cash=g.state.money,second=g.actions.startProduction(crush()).jobId;
    g.actions.cancelProduction(second);g.actions.cancelProduction(second);g.advance(1);
    expect(g.state.production.history).toHaveLength(2);
    expect(g.state.production.history[0]).toEqual(receipt);
    expect(g.state.production.history[1]).toMatchObject({id:second,status:'cancelled',cost:2,returnedTonnes:2,output:{},rejects:{}});
    expect(g.state.money).toBe(cash-2);expect(g.state.production.batches).toBe(1);
    const loaded=createGame({data:g.data,state:JSON.parse(JSON.stringify(g.snapshot()))});
    loaded.advance(1);expect(loaded.state.production.history).toEqual(g.state.production.history);
  });

  it('bounds saved receipts without resetting lifetime counters and defaults saves with existing jobs', () => {
    const g=setup();g.data.production.historyLimit=2;storeStockpile(g.ctx,'west',{rock:4});
    for(let i=0;i<3;i++){g.actions.startProduction(crush(1));finish(g);}
    expect(g.state.production.history.map(e=>e.id)).toEqual(['batch-2','batch-3']);
    expect(g.state.production.batches).toBe(3);
    g.actions.startProduction(crush(1));const saved=JSON.parse(JSON.stringify(g.snapshot()));
    delete saved.production.plans;delete saved.production.history;
    const loaded=createGame({data:g.data,state:saved});
    expect(loaded.state.production.history).toEqual([]);expect(loaded.state.production.plans).toEqual({});
    finish(loaded);expect(loaded.state.production.history).toHaveLength(1);expect(loaded.state.production.batches).toBe(4);
  });

  it('reloads screened product into a carrier and sells only that material after weighing', () => {
    const g=setup();const digger=g.actions.buyMachine('miniDigger','rusty').machine,truck=g.state.machines[0];
    storeStockpile(g.ctx,'west',{gravel:1,sand:1});g.actions.startProduction(screen(2));finish(g);
    const completed=structuredClone(g.state.production.history), sold=g.state.stats.tonnesSold, dug=g.state.stats.tonnesDug;
    expect(g.actions.bucketCut(digger.id,{stockpileBay:'east'}).tonnes).toBeGreaterThan(0);
    const moved=g.actions.dumpBucket(digger.id,{machineId:truck.id}).tonnes;
    expect(moved).toBeGreaterThan(0);expect(g.state.stats.tonnesSold).toBe(sold);expect(g.state.stats.tonnesDug).toBe(dug);
    expect(g.actions.tip(truck.id,{bay:'gravel'}).ok).toBe(false);
    expect(g.actions.weighIn(truck.id).ok).toBe(true);
    expect(g.actions.tip(truck.id,{bay:'gravel'}).ok).toBe(true);tickJobs(g.ctx,truck.job.duration+.01);
    expect(g.state.stats.tonnesSold-sold).toBeCloseTo(moved);
    expect(pileTotal(truck.load)).toBe(0);
    expect(pileTotal(stockpileLoad(g.ctx,'east'))+pileTotal(digger.load)+moved).toBeCloseTo(1);
    expect(stockpileLoad(g.ctx,'west')).toEqual({sand:1});
    expect(g.state.production.history).toEqual(completed);
  });
});

describe('soil recovery recipes',()=>{
 for(const [recipeId,material] of [['screenTopsoil','topsoil'],['screenClay','clay']])it(`recovers ${material} without losing the other layers`,()=>{
  const g=setup();storeStockpile(g.ctx,'west',{topsoil:2,clay:1,gravel:1});
  const request={plantId:'screener',recipeId,sourceBay:'west',outputBay:'east',tonnes:4};
  const q=g.actions.quoteProduction(request);expect(q.ok).toBe(true);expect(g.actions.startProduction(request).ok).toBe(true);finish(g);
  const expected=material==='topsoil'?2:1;expect(stockpileLoad(g.ctx,'east')).toEqual({[material]:expected});
  expect(stockpileLoad(g.ctx,'west')[material]??0).toBe(0);expect(inventory(g)).toBe(4);
  expect(g.actions.quoteProduction(request).ok).toBe(false);
 });
});
