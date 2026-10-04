import {describe,it,expect} from 'vitest';
import {createGame} from '../game/index.js';
import {loadData,ticksPerHour} from '../core/index.js';
import {storeStockpile} from '../buildings/index.js';
import {plantStatus} from './index.js';
const setup=()=>{const data=loadData();data.milestones.list=[];const g=createGame({data});g.state.money=20000;g.actions.buyBuilding('stockpiles');g.actions.buyBuilding('crusher');storeStockpile(g.ctx,'west',{rock:20});return g;};
const request={plantId:'crusher',recipeId:'crushRock',sourceBay:'west',outputBay:'middle',tonnes:10};
describe('industrial plant development',()=>{
 it('upgrades speed and cost without creating material or changing quoted running jobs',()=>{
  const g=setup(),base=g.actions.quoteProduction(request),cash=g.state.money;
  expect(g.actions.upgradePlant('crusher').ok).toBe(true);expect(g.state.money).toBe(cash-850);
  const q=g.actions.quoteProduction(request);expect(q.hours).toBeLessThan(base.hours);expect(q.cost).toBeLessThan(base.cost);expect(q.output).toEqual(base.output);
  g.actions.startProduction(request);const job=JSON.stringify(g.state.production.jobs[0]);
  expect(g.actions.upgradePlant('crusher').ok).toBe(false);expect(JSON.stringify(g.state.production.jobs[0])).toBe(job);
 });
 it('wears completed work and blocks an exhausted plant until a paid timed service finishes',()=>{
  const g=setup();g.data.production.maintenance.wearPerTonne=10;
  g.actions.startProduction(request);g.advance(300);expect(plantStatus(g.ctx,'crusher').condition).toBe(0);
  expect(g.actions.startProduction(request).reason).toMatch(/Service/);
  const cash=g.state.money;expect(g.actions.servicePlant('crusher').ok).toBe(true);expect(g.state.money).toBe(cash-200);
  expect(g.actions.servicePlant('crusher').ok).toBe(false);expect(g.actions.startProduction(request).reason).toMatch(/serviced/);
  const loaded=createGame({data:g.data,state:JSON.parse(JSON.stringify(g.snapshot()))});
  expect(plantStatus(loaded.ctx,'crusher').condition).toBe(0);loaded.advance(Math.ceil(.5*ticksPerHour(g.data))+1);
  expect(plantStatus(loaded.ctx,'crusher').condition).toBe(100);expect(loaded.state.money).toBe(cash-200);
  expect(loaded.actions.startProduction(request).ok).toBe(true);
 });
 it('refuses unowned, healthy, max-level and unaffordable work without changing state',()=>{
  const g=setup();expect(g.actions.upgradePlant('screener').ok).toBe(false);expect(g.actions.servicePlant('crusher').ok).toBe(false);
  g.actions.upgradePlant('crusher');g.actions.upgradePlant('crusher');const before=JSON.stringify(g.snapshot());
  expect(g.actions.upgradePlant('crusher').ok).toBe(false);expect(JSON.stringify(g.snapshot())).toBe(before);
  const saved=JSON.parse(JSON.stringify(g.snapshot()));delete saved.production.plants;delete saved.production.services;
  const old=createGame({state:saved,data:g.data});expect(plantStatus(old.ctx,'crusher').condition).toBe(100);expect(plantStatus(old.ctx,'crusher').level).toBe(0);
  old.state.money=0;const poor=JSON.stringify(old.snapshot());
  expect(old.actions.upgradePlant('crusher').ok).toBe(false);expect(JSON.stringify(old.snapshot())).toBe(poor);
 });
});
