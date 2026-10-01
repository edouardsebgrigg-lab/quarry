import { describe, it, expect } from 'vitest';
import { createGame } from '../game/index.js';
import { hasTicket, weighIn, quoteDelivery } from './depot.js';
import { attachedTrailer } from '../machinery/trailers.js';

describe('independent trailer delivery', () => {
  it('loads by hand, weighs the actual trailer, and invalidates on unhitch or cargo changes', () => {
    const g = createGame({seed:9});
    g.state.money = 10000;
    const tractor = g.actions.buyMachine('tractor','utility60').machine;
    const trailer = g.actions.buyMachine('trailer','singleTipper').machine;
    expect(g.actions.attachTrailer(tractor.id,trailer.id).ok).toBe(true);
    g.state.tools.shovel.load = {gravel:.01};
    g.actions.shovelDump({into:'machine',machineId:tractor.id});
    expect(trailer.load.gravel).toBe(.01);
    trailer.load = {gravel:1};
    expect(weighIn(g.ctx,tractor)).toMatchObject({ok:true,tonnes:1});
    expect(hasTicket(g.ctx,tractor.id)).toBe(true);
    expect(g.actions.detachTrailer(tractor.id).ok).toBe(true);
    expect(hasTicket(g.ctx,tractor.id)).toBe(false);
    expect(trailer.load).toEqual({gravel:1});
    expect(g.actions.attachTrailer(tractor.id,trailer.id).ok).toBe(true);
    weighIn(g.ctx,tractor);
    trailer.load = {sand:1};
    expect(hasTicket(g.ctx,tractor.id)).toBe(false);
  });
  it('preserves old bundled tractor loads and valid tickets exactly once', () => {
    const g = createGame({seed:9});
    g.state.money = 10000;
    const tractor = g.actions.buyMachine('tractor','rusty').machine;
    delete tractor.trailerId;
    tractor.load = {topsoil:2};
    g.state.depot.tickets[tractor.id] = {tonnes:2,materials:{topsoil:2}};
    const loaded = createGame({state:JSON.parse(JSON.stringify(g.snapshot()))});
    const t = loaded.state.machines.find(m=>m.id===tractor.id);
    expect(attachedTrailer(loaded.ctx,t).load).toEqual({topsoil:2});
    expect(t.load).toEqual({});
    expect(hasTicket(loaded.ctx,t.id)).toBe(true);
    const again = createGame({state:JSON.parse(JSON.stringify(loaded.snapshot()))});
    expect(again.state.machines).toHaveLength(loaded.state.machines.length);
  });
  it('quotes broken rock and adds its market state to old saves', () => {
    const g = createGame({seed:9});
    const old = JSON.parse(JSON.stringify(g.snapshot()));
    delete old.market.products.rock;
    const loaded = createGame({state:old});
    expect(quoteDelivery(loaded.ctx,'rock',{rock:2}).gross).toBeGreaterThan(0);
  });
});
