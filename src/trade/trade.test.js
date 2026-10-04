import {describe,it,expect} from 'vitest';
import {createGame} from '../game/index.js';
import {loadData,ticksPerDay} from '../core/index.js';
import {buyerDemand,quoteBuyerDelivery,buyerRelationship} from './index.js';
import {tickJobs,startJob} from '../machinery/index.js';
import {hasTicket} from '../economy/index.js';
const setup=()=>{const data=loadData();data.milestones.list=[];const g=createGame({data,seed:3});g.state.money=30000;return g;};
const finish=(g,m)=>tickJobs(g.ctx,m.job.duration+.01);
describe('regional delivery businesses',()=>{
 it('quotes without changing state and refuses unsuitable/empty loads',()=>{
  const g=setup(),before=JSON.stringify(g.snapshot());
  expect(quoteBuyerDelivery(g.ctx,'nursery',{topsoil:2})).toMatchObject({ok:true,tonnes:2,material:'topsoil'});
  expect(quoteBuyerDelivery(g.ctx,'nursery',{topsoil:1,clay:1}).ok).toBe(false);
  expect(quoteBuyerDelivery(g.ctx,'concrete',{}).ok).toBe(false);
  expect(quoteBuyerDelivery(g.ctx,'missing',{sand:1}).ok).toBe(false);
  expect(JSON.stringify(g.snapshot())).toBe(before);
 });
 it('requires a ticket and only sells the daily quota, preserving excess cargo',()=>{
  const g=setup(),m=g.state.machines[0];m.load={topsoil:10};
  expect(g.actions.tip(m.id,{buyerId:'nursery'}).ok).toBe(false);
  g.actions.weighIn(m.id);const quote=quoteBuyerDelivery(g.ctx,'nursery',m.load),sales=[];
  g.events.on('productSold',e=>sales.push(e));
  expect(g.actions.tip(m.id,{buyerId:'nursery'}).ok).toBe(true);finish(g,m);
  expect(m.load.topsoil).toBeCloseTo(2);expect(g.state.stats.tonnesSold).toBeCloseTo(8);
  expect(sales[0]).toMatchObject({buyerId:'nursery',tonnes:8,revenue:quote.gross});
  expect(buyerDemand(g.ctx,'nursery','topsoil')).toBe(0);expect(hasTicket(g.ctx,m.id)).toBe(false);
  expect(g.state.trade.history[0].tonnes).toBe(8);
 });
 it('does not assign a regional sale to an unrelated depot contract',()=>{
  const g=setup(),m=g.state.machines[0];
  g.state.contracts.active=[{id:'test-job',material:'topsoil',tonnes:10,delivered:0,deadline:5}];
  m.load={topsoil:1};g.actions.weighIn(m.id);g.actions.tip(m.id,{buyerId:'nursery'});finish(g,m);
  expect(g.state.contracts.active[0].delivered).toBe(0);
 });
 it('keeps partial deliveries in the attached trailer and rejects site machines',()=>{
  const g=setup();g.state.money=100000;
  const tractor=g.actions.buyMachine('tractor','used').machine,trailer=g.actions.buyMachine('trailer','used').machine;
  expect(g.actions.attachTrailer(tractor.id,trailer.id).ok).toBe(true);trailer.load={topsoil:10};
  g.actions.weighIn(tractor.id);expect(g.actions.tip(tractor.id,{buyerId:'nursery'}).ok).toBe(true);finish(g,tractor);
  expect(trailer.load.topsoil).toBeCloseTo(2);expect(tractor.load).toEqual({});
  const dumper=g.actions.buyMachine('dumper','used').machine;dumper.load={topsoil:1};
  expect(g.actions.tip(dumper.id,{buyerId:'nursery'}).ok).toBe(false);
 });
 it('reserves demand across simultaneous tipping jobs and saves those reservations',()=>{
  const g=setup(),a=g.state.machines[0],b=g.actions.buyMachine('truck','used').machine;
  a.load={topsoil:6};b.load={topsoil:6};g.actions.weighIn(a.id);g.actions.weighIn(b.id);
  expect(g.actions.tip(a.id,{buyerId:'nursery'}).ok).toBe(true);
  expect(buyerDemand(g.ctx,'nursery','topsoil')).toBe(2);
  expect(startJob(g.ctx,b.id,'tip',{byPlayer:false,params:{buyerId:'nursery'}}).ok).toBe(true);expect(b.job.params.buyerTonnes).toBe(2);
  const loaded=createGame({data:g.data,state:JSON.parse(JSON.stringify(g.snapshot()))});
  expect(buyerDemand(loaded.ctx,'nursery','topsoil')).toBe(0);tickJobs(loaded.ctx,1000);
  expect(loaded.state.stats.tonnesSold).toBeCloseTo(8);
  expect(loaded.state.machines.find(m=>m.id===b.id).load.topsoil).toBeCloseTo(4);
 });
 it('refuses changed cargo at completion without losing it or taking demand',()=>{
  const g=setup(),m=g.state.machines[0];m.load={topsoil:1};g.actions.weighIn(m.id);g.actions.tip(m.id,{buyerId:'nursery'});
  m.load={clay:1};finish(g,m);expect(m.load).toEqual({clay:1});expect(buyerDemand(g.ctx,'nursery','topsoil')).toBe(8);expect(g.state.trade.history).toEqual([]);
 });
 it('refreshes daily demand while retaining supplier relationships and receipts after load',()=>{
  const g=setup(),m=g.state.machines[0];
  for(let i=0;i<4;i++){m.load={topsoil:8};g.actions.weighIn(m.id);g.actions.tip(m.id,{buyerId:'nursery'});finish(g,m);g.state.time.tick+=ticksPerDay(g.data);}
  expect(buyerRelationship(g.ctx,'nursery').name).toBe('Regular supplier');expect(buyerDemand(g.ctx,'nursery','topsoil')).toBe(8);
  const loaded=createGame({data:g.data,state:JSON.parse(JSON.stringify(g.snapshot()))});
  expect(loaded.state.trade.history).toHaveLength(4);expect(loaded.state.trade.lifetime.nursery).toBe(32);
  expect(quoteBuyerDelivery(loaded.ctx,'nursery',{topsoil:1}).multiplier).toBeCloseTo(1.3*1.05);
 });
 it('rejects conflicting destinations and gives navigation back to other chosen targets',()=>{
  const g=setup(),m=g.state.machines[0];m.load={topsoil:1};g.actions.weighIn(m.id);
  expect(g.actions.tip(m.id,{buyerId:'nursery',bay:'topsoil'}).ok).toBe(false);
  expect(g.actions.navigateBuyer('nursery').ok).toBe(true);g.actions.setWorkArea('0-0');expect(g.state.player.navigationBuyerId).toBeNull();
  g.actions.navigateBuyer('concrete');g.actions.navigateFleet(m.id);expect(g.state.player.navigationBuyerId).toBeNull();
  expect(g.actions.navigateBuyer('missing').ok).toBe(false);
 });
});
