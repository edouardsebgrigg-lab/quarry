import {describe,it,expect} from 'vitest';
import {createGame} from '../game/index.js';
import {loadData,ticksPerHour} from '../core/index.js';
import {stockpileLoad,storeStockpile,stockpileRoom} from '../buildings/index.js';
import {productionQueue,productionQueueStatus} from './index.js';
const setup=()=>{const data=loadData();data.milestones.list=[];const g=createGame({data,seed:3});g.state.money=20000;for(const id of ['stockpiles','crusher','screener'])g.actions.buyBuilding(id);return g;};
const crush={plantId:'crusher',recipeId:'crushRock',sourceBay:'west',outputBay:'middle',tonnes:2};
const finish=g=>g.advance(Math.ceil(Math.max(...g.state.production.jobs.map(j=>j.remainingHours))*ticksPerHour(g.data))+1);
describe('saved finite production schedules',()=>{
 it('plans without charging, reserving or inventing feed, then starts when feed arrives',()=>{
  const g=setup(),cash=g.state.money;
  expect(g.actions.queueProduction(crush,{batches:2}).ok).toBe(true);const before=JSON.stringify(g.snapshot());
  expect(productionQueueStatus(g.ctx,'crusher').reason).toMatch(/feed/);expect(JSON.stringify(g.snapshot())).toBe(before);
  g.advance(5);expect(g.state.money).toBe(cash);expect(stockpileRoom(g.ctx,'west')).toBe(25);
  storeStockpile(g.ctx,'west',{rock:4});g.advance(1);expect(g.state.money).toBe(cash-2);expect(g.state.production.jobs).toHaveLength(1);
  expect(productionQueue(g.ctx,'crusher').entries[0].remaining).toBe(1);finish(g);finish(g);
  expect(g.state.production.batches).toBe(2);expect(g.state.money).toBe(cash-4);expect(productionQueue(g.ctx,'crusher').entries).toHaveLength(0);
  expect(stockpileLoad(g.ctx,'middle').gravel).toBeCloseTo(3.2);expect(stockpileLoad(g.ctx,'middle').sand).toBeCloseTo(.8);
 });
 it('connects crushing and screening while preserving every material and saved order count',()=>{
  const g=setup();storeStockpile(g.ctx,'west',{rock:4});g.actions.queueProduction(crush,{batches:2});
  g.actions.queueProduction({...crush,plantId:'screener',recipeId:'screenGravel',sourceBay:'middle',outputBay:'east'},{batches:2});g.advance(1);
  const restored=createGame({data:g.data,state:JSON.parse(JSON.stringify(g.snapshot()))});restored.advance(ticksPerHour(g.data));
  expect(restored.state.production.batches).toBe(4);
  const loads=restored.state.stockpiles.home;
  expect(Object.values(loads).reduce((t,l)=>t+Object.values(l).reduce((a,b)=>a+b,0),0)).toBeCloseTo(4);
  expect(loads.east.gravel).toBeGreaterThan(2.8);expect(restored.state.production.jobs).toHaveLength(0);
  expect(restored.state.stats.tonnesSold).toBe(0);
 });
 it('keeps working capital and retries after funding or making output space',()=>{
  const g=setup();storeStockpile(g.ctx,'west',{rock:2});storeStockpile(g.ctx,'middle',{sand:25});g.actions.queueProduction(crush);
  g.advance(2);expect(productionQueueStatus(g.ctx,'crusher').reason).toMatch(/space/);
  g.state.stockpiles.home.middle={};g.state.money=101;g.advance(1);
  expect(productionQueueStatus(g.ctx,'crusher').reason).toMatch(/bank/);expect(g.state.money).toBe(101);
  g.state.money=102;g.advance(1);expect(g.state.money).toBe(100);expect(g.state.production.jobs).toHaveLength(1);
 });
 it('shares the cash reserve between plants starting on the same tick',()=>{
  const g=setup();storeStockpile(g.ctx,'west',{rock:2});storeStockpile(g.ctx,'middle',{gravel:2});
  g.actions.queueProduction({...crush,outputBay:'east'});
  g.actions.queueProduction({...crush,plantId:'screener',recipeId:'screenGravel',sourceBay:'middle',outputBay:'east'});
  g.state.money=103;g.advance(1);
  expect(g.state.production.jobs).toHaveLength(1);expect(g.state.money).toBe(101);
  expect(productionQueueStatus(g.ctx,'screener').reason).toMatch(/bank/);
  expect(stockpileLoad(g.ctx,'middle')).toEqual({gravel:2});
 });
 it('pauses future batches, cancels held feed once, and does not silently restart cancelled work',()=>{
  const g=setup();storeStockpile(g.ctx,'west',{rock:4});g.actions.queueProduction(crush,{batches:2});g.advance(1);
  const id=g.state.production.jobs[0].id;expect(g.actions.cancelProduction(id).ok).toBe(true);
  g.advance(10);expect(g.state.production.jobs).toHaveLength(0);expect(stockpileLoad(g.ctx,'west').rock).toBe(4);
  expect(productionQueue(g.ctx,'crusher').paused).toBe(true);expect(productionQueue(g.ctx,'crusher').entries[0].remaining).toBe(1);
  g.actions.pauseProductionQueue('crusher',false);g.advance(1);expect(g.state.production.jobs).toHaveLength(1);
  g.actions.pauseProductionQueue('crusher',true);finish(g);expect(g.state.production.batches).toBe(1);
 });
 it('allows reordering/removal without touching cargo and validates bounded orders',()=>{
  const g=setup(),a=g.actions.queueProduction(crush).id,b=g.actions.queueProduction({...crush,tonnes:3}).id;
  expect(g.actions.moveQueuedProduction('crusher',b,-1).ok).toBe(true);expect(productionQueue(g.ctx,'crusher').entries[0].id).toBe(b);
  expect(g.actions.removeQueuedProduction('crusher',a).ok).toBe(true);
  for(const batches of [0,-1,1.2,Infinity,21])expect(g.actions.queueProduction(crush,{batches}).ok).toBe(false);
  for(const request of [{...crush,tonnes:NaN},{...crush,outputBay:'west'},{...crush,recipeId:'bad'}])expect(g.actions.queueProduction(request).ok).toBe(false);
  for(let i=1;i<8;i++)g.actions.queueProduction(crush);
  const before=JSON.stringify(g.snapshot());expect(g.actions.queueProduction(crush).ok).toBe(false);expect(JSON.stringify(g.snapshot())).toBe(before);
  expect(g.actions.setProductionCashReserve(-1).ok).toBe(false);
 });
 it('waits for servicing and uses fresh upgraded costs and speeds, with safe legacy defaults',()=>{
  const g=setup();storeStockpile(g.ctx,'west',{rock:4});g.actions.queueProduction(crush);
  g.actions.upgradePlant('crusher');g.state.production.plants.home.crusher.condition=50;g.actions.servicePlant('crusher');
  expect(productionQueueStatus(g.ctx,'crusher').reason).toMatch(/serviced/);g.advance(1);expect(g.state.production.jobs).toHaveLength(0);
  g.advance(Math.ceil(.5*ticksPerHour(g.data)));expect(g.state.production.jobs[0].cost).toBe(1.8);
  expect(g.state.production.jobs[0].hours).toBeCloseTo(2/(24*1.3));
  const saved=JSON.parse(JSON.stringify(g.snapshot()));delete saved.production.schedules;delete saved.production.cashReserve;delete saved.production.nextQueueId;
  const old=createGame({state:saved,data:g.data});expect(old.state.production.cashReserve).toBe(100);expect(productionQueue(old.ctx,'crusher').entries).toEqual([]);
 });
});
