import { describe, it, expect } from 'vitest';
import { createTestGame } from '../game/testing.js';
import { createGame } from '../game/index.js';
import { hasTicket, quoteDelivery } from './index.js';
import { tickJobs } from '../machinery/index.js';
const setup=()=>{
  const game=createTestGame(); game.state.money=10000;
  const truck=game.state.machines.find(m=>m.type==='truck'); truck.load={gravel:2};
  return {game,truck};
};
const finish=(game,m)=>tickJobs(game.ctx,m.job.duration+0.01);
describe('home and depot weighbridge tickets',()=>{
  it('commissions once, shows the best current quote, and sells with a home ticket',()=>{
    const {game,truck}=setup();
    expect(game.actions.weighIn(truck.id,{home:true}).reason).toMatch(/Commission/);
    const cash=game.state.money;
    expect(game.actions.buyBuilding('weighbridge').ok).toBe(true);
    expect(game.state.money).toBe(cash-game.data.buildings.weighbridge.price);
    expect(game.actions.buyBuilding('weighbridge').ok).toBe(false);
    const r=game.actions.weighIn(truck.id,{home:true});
    expect(r.ok).toBe(true);expect(r.tonnes).toBe(2);
    expect(r.quote).toMatchObject({bay:'gravel',grade:'Clean',gross:quoteDelivery(game.ctx,'gravel',truck.load).gross});
    expect(game.actions.tip(truck.id,{bay:'gravel'}).ok).toBe(true);finish(game,truck);
    expect(game.state.stats.tonnesSold).toBe(2);expect(hasTicket(game.ctx,truck.id)).toBe(false);
    truck.load={gravel:2};expect(game.actions.tip(truck.id,{bay:'gravel'}).reason).toMatch(/Weigh/);
  });
  it('issues one event per unchanged load and invalidates a changed composition at the same weight',()=>{
    const {game,truck}=setup();const events=[];game.events.on('weighedIn',e=>events.push(e));
    game.actions.weighIn(truck.id);game.actions.weighIn(truck.id);
    expect(events).toHaveLength(1);
    truck.load={gravel:1,clay:1};expect(hasTicket(game.ctx,truck.id)).toBe(false);
    expect(game.actions.tip(truck.id,{bay:'gravel'}).ok).toBe(false);
    game.actions.weighIn(truck.id);expect(events).toHaveLength(2);
    truck.load.gravel+=0.1;expect(hasTicket(game.ctx,truck.id)).toBe(false);
  });
  it('clears tickets on field and stockpile tips and does not count them as sales',()=>{
    for(const stock of [false,true]){
      const {game,truck}=setup();if(stock)game.actions.buyBuilding('stockpiles');
      game.actions.weighIn(truck.id);
      expect(game.actions.tip(truck.id,stock?{stockpileBay:'west'}:{x:60,z:60}).ok).toBe(true);finish(game,truck);
      expect(game.state.depot.tickets[truck.id]).toBeUndefined();expect(game.state.stats.tonnesSold).toBe(0);
    }
  });
  it('refuses a sale if the load changes during the unloading job, conserving the load',()=>{
    const {game,truck}=setup();game.actions.weighIn(truck.id);
    game.actions.tip(truck.id,{bay:'gravel'});truck.load={clay:2};
    const events=[];game.events.on('jobFailed',e=>events.push(e));finish(game,truck);
    expect(truck.load).toEqual({clay:2});expect(game.state.stats.tonnesSold).toBe(0);
    expect(events[0].reason).toMatch(/Load changed/);
  });
  it('saves valid tickets and commissioning, while old or mismatched tickets are discarded',()=>{
    const {game,truck}=setup();game.actions.buyBuilding('weighbridge');game.actions.weighIn(truck.id,{home:true});
    const saved=JSON.parse(JSON.stringify(game.snapshot()));const loaded=createGame({state:saved});
    expect(hasTicket(loaded.ctx,truck.id)).toBe(true);
    expect(loaded.actions.weighIn(truck.id,{home:true}).existing).toBe(true);
    delete saved.buildings;delete saved.depot.tickets[truck.id].materials;
    const legacy=createGame({state:saved});expect(hasTicket(legacy.ctx,truck.id)).toBe(false);
    expect(legacy.actions.weighIn(truck.id,{home:true}).ok).toBe(false);
    expect(legacy.actions.weighIn(truck.id).ok).toBe(true);
  });
  it('rejects site machinery and an empty load without creating tickets',()=>{
    const {game,truck}=setup();const digger=game.state.machines.find(m=>m.type==='excavator');digger.load={gravel:0.5};
    expect(game.actions.weighIn(digger.id).reason).toMatch(/road/);
    truck.load={};expect(game.actions.weighIn(truck.id).ok).toBe(false);
    expect(hasTicket(game.ctx,truck.id)).toBe(false);
  });
});
