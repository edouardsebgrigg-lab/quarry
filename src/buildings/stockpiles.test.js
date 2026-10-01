import { describe, it, expect } from 'vitest';
import { createGame } from '../game/index.js';
import { loadData } from '../core/index.js';
import { stockpileLoad, stockpileRoom, storeStockpile } from './index.js';
import { quoteDelivery } from '../economy/index.js';
import { getStats, startJob } from '../machinery/index.js';
import { pileTotal } from '../quarry/index.js';
const setup = () => {
  const data = loadData(); data.milestones.list=[];
  const game = createGame({seed:3,data}); game.state.money=10000;
  game.actions.buyBuilding('stockpiles'); game.actions.buyMachine('miniDigger','rusty');
  const truck=game.state.machines[0], digger=game.state.machines.find(m=>m.type==='miniDigger');
  return {game,truck,digger,ctx:game.ctx,a:game.actions};
};
const finish = game => game.advance(400);
describe('T6 stockpile bays',()=>{
  it('tips actual dug tonnes, reloads a bucket and conserves every material without a sale',()=>{
    const {game,truck,digger,ctx,a}=setup();
    const cut=a.digGround({x:40,z:40,radius:2,bottomY:ctx.ground.heightAt(40,40)-0.5,maxTonnes:0.8});
    truck.load={...cut.tonnes}; const sold=game.state.stats.tonnesSold, dug=game.state.stats.tonnesDug;
    const sales=[]; game.events.on('productSold',e=>sales.push(e));
    a.weighIn(truck.id);
    expect(a.tip(truck.id,{stockpileBay:'west'}).ok).toBe(true); finish(game);
    expect(truck.load).toEqual({}); expect(ctx.state.depot.tickets[truck.id]).toBeUndefined();
    expect(stockpileLoad(ctx,'west')).toEqual(cut.tonnes);
    expect(a.scoop(digger.id,{stockpileBay:'west'}).ok).toBe(true); finish(game);
    for(const [id,t] of Object.entries(cut.tonnes)) expect((stockpileLoad(ctx,'west')[id]??0)+(digger.load[id]??0)).toBeCloseTo(t,9);
    expect(a.dumpBucket(digger.id,{machineId:truck.id}).ok).toBe(true);
    for(const [id,t] of Object.entries(cut.tonnes)) expect((stockpileLoad(ctx,'west')[id]??0)+(truck.load[id]??0)).toBeCloseTo(t,9);
    expect(sales).toEqual([]); expect(game.state.stats.tonnesSold).toBe(sold); expect(game.state.stats.tonnesDug).toBe(dug);
  });
  it('refuses a full bay without changing inventory, money, tickets or saved state',()=>{
    const {game,ctx,truck,a}=setup(); storeStockpile(ctx,'west',{topsoil:25}); truck.load={topsoil:0.5};
    a.weighIn(truck.id); const before=JSON.stringify(game.snapshot());
    expect(a.tip(truck.id,{stockpileBay:'west'}).reason).toMatch(/full/);
    expect(JSON.stringify(game.snapshot())).toBe(before);
  });
  it('reserves capacity for simultaneous tips and still refuses duplicates',()=>{
    const {game,ctx,truck}=setup(); storeStockpile(ctx,'west',{gravel:24}); truck.load={gravel:0.8};
    expect(startJob(ctx,truck.id,'tip',{byPlayer:false,params:{stockpileBay:'west'}}).ok).toBe(true);
    expect(stockpileRoom(ctx,'west')).toBeCloseTo(0.2);
    const other=game.actions.buyMachine('dumper','rusty').machine; other.load={gravel:0.8};
    expect(startJob(ctx,other.id,'tip',{byPlayer:false,params:{stockpileBay:'west'}}).reason).toMatch(/full/);
    finish(game); expect(pileTotal(stockpileLoad(ctx,'west'))).toBeCloseTo(24.8);
  });
  it('mixing reduces depot purity; proportional extraction retains the mixture',()=>{
    const {ctx,digger,a,game}=setup(); storeStockpile(ctx,'west',{topsoil:9}); storeStockpile(ctx,'west',{clay:1});
    const before=quoteDelivery(ctx,'topsoil',stockpileLoad(ctx,'west'));
    expect(before.purity).toBeCloseTo(0.9); expect(before.grade).toBe('Slightly mixed');
    a.scoop(digger.id,{stockpileBay:'west'}); finish(game);
    expect(quoteDelivery(ctx,'topsoil',digger.load).purity).toBeCloseTo(0.9);
    expect(quoteDelivery(ctx,'topsoil',stockpileLoad(ctx,'west')).purity).toBeCloseTo(0.9);
  });
  it('Direct cuts respect bucket volume and bucket dumping only moves what fits',()=>{
    const {ctx,digger,a}=setup(); storeStockpile(ctx,'middle',{sand:3});
    const r=a.bucketCut(digger.id,{stockpileBay:'middle'}); expect(r.tonnes).toBeGreaterThan(0);
    expect(ctx.ground.looseVolume(digger.load)).toBeCloseTo(getStats(ctx.data,digger).bucketVolume,8);
    storeStockpile(ctx,'west',{topsoil:24.99}); const before=pileTotal(digger.load);
    expect(a.dumpBucket(digger.id,{stockpileBay:'west'}).tonnes).toBeCloseTo(0.01);
    expect(pileTotal(digger.load)).toBeCloseTo(before-0.01); expect(pileTotal(stockpileLoad(ctx,'west'))).toBeCloseTo(25);
  });
  it('inventory, commissioned bays and running tip reservations survive save/load; old saves are empty',()=>{
    const {game,ctx,truck,a}=setup(); storeStockpile(ctx,'west',{sand:5}); truck.load={clay:0.5}; a.tip(truck.id,{stockpileBay:'middle'});
    const saved=JSON.parse(JSON.stringify(game.snapshot())); const g2=createGame({state:saved}); finish(g2);
    expect(stockpileLoad(g2.ctx,'west')).toEqual({sand:5}); expect(stockpileLoad(g2.ctx,'middle')).toEqual({clay:0.5});
    delete saved.stockpiles; const old=createGame({state:saved}); expect(old.state.stockpiles).toEqual({});
  });
  it('rejects unowned, unknown and contradictory destinations',()=>{
    const {game,ctx,truck,a,digger}=setup(); truck.load={topsoil:0.5};
    expect(a.tip(truck.id,{stockpileBay:'west',bay:'topsoil'}).ok).toBe(false);
    expect(a.tip(truck.id,{stockpileBay:'wrong'}).ok).toBe(false);
    delete game.state.buildings.home.stockpiles;
    expect(a.tip(truck.id,{stockpileBay:'west'}).ok).toBe(false);
    expect(a.scoop(digger.id,{stockpileBay:'west'}).ok).toBe(false);
  });
});
