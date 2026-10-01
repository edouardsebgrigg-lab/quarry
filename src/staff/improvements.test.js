import {describe,it,expect} from 'vitest';
import {createTestGame} from '../game/testing.js';
import {createGame} from '../game/index.js';
import {staffState,assignWorker,configureHaul,staffTick} from './index.js';
import {contractsState} from '../contracts/index.js';
import {tickJobs,getStats} from '../machinery/index.js';
import {pileTotal} from '../quarry/index.js';
const worker=(id)=>({id,name:id,skills:{dig:1,drive:1,sell:1,fix:1},wage:26,hired:1,role:null,machineId:null,spot:null,phase:'idle',t:0,status:'idle',stats:{dug:0,loads:0,sold:0,fixed:0}});
function setup(){
 const game=createTestGame(7);game.state.money=10000;
 const operator=worker('operator'),driver=worker('driver');staffState(game.ctx).workers.push(operator,driver);staffState(game.ctx);
 const digger=game.state.machines.find(m=>m.type==='excavator'),truck=game.state.machines.find(m=>m.type==='truck');
 return {game,operator,driver,digger,truck};
}
function ticks(game,n=1000){for(let i=0;i<n;i++){tickJobs(game.ctx,0.1);staffTick(game.ctx,0.1);}}
const job=(id,material,deadline=30)=>({id,client:`Client ${id}`,material,tonnes:5,delivered:0,bonus:10,deadline});
describe('staff customer choices, experience and paired loading',()=>{
 it('takes the requested smaller heap and credits the chosen job rather than an earlier job',()=>{
  const {game,driver,truck}=setup();const c=contractsState(game.ctx);c.active=[job(1,'gravel',5),job(2,'gravel',20)];
  const g=game.ctx.ground;g.deposit({x:40,z:40,tonnes:{topsoil:12},radius:2});g.deposit({x:100,z:100,tonnes:{gravel:3},radius:2});
  assignWorker(game.ctx,driver.id,'haul',{machineId:truck.id});expect(configureHaul(game.ctx,driver.id,{delivery:{kind:'job',id:2}}).ok).toBe(true);
  const sales=[];game.events.on('productSold',e=>sales.push(e));ticks(game,5000);
  expect(sales.length).toBeGreaterThan(0);expect(sales[0]).toMatchObject({productId:'gravel',deliveryTarget:{kind:'job',id:2}});
  expect(sales[0].purity).toBeGreaterThanOrEqual(0.95);expect(c.active[0].delivered).toBe(0);expect(c.active[1].delivered).toBeGreaterThan(0);
 });
 it('fills the regular quota on purpose even when a board job is due earlier, then waits',()=>{
  const {game,driver,truck}=setup();const c=contractsState(game.ctx);c.active=[job(1,'gravel',4)];
  c.standing.active={client:'Regular',material:'gravel',tonnesPerWeek:1,delivered:0,weeklyBonus:10,weekEnd:10,paidThisWeek:false,weeksDone:0,weeks:3,week:1};
  truck.load={gravel:1};assignWorker(game.ctx,driver.id,'haul',{machineId:truck.id});configureHaul(game.ctx,driver.id,{delivery:{kind:'standing',client:'Regular',material:'gravel'}});
  ticks(game,5000);expect(c.standing.active.paidThisWeek).toBe(true);expect(c.active[0].delivered).toBe(0);
  expect(driver.stats.loads).toBe(1);expect(driver.status).toMatch(/Quota filled/);
 });
 it('waits when the selected material is absent and refuses invalid targets without changing settings',()=>{
  const {game,driver,truck}=setup();contractsState(game.ctx).active=[job(1,'gravel')];
  game.ctx.ground.deposit({x:40,z:40,tonnes:{topsoil:12},radius:2});assignWorker(game.ctx,driver.id,'haul',{machineId:truck.id});
  configureHaul(game.ctx,driver.id,{delivery:{kind:'job',id:1}});ticks(game,200);
  expect(driver.status).toMatch(/Waiting for clean gravel/);expect(truck.load).toEqual({});expect(game.state.stats.tonnesSold).toBe(0);
  expect(configureHaul(game.ctx,driver.id,{delivery:{kind:'job',id:99}}).ok).toBe(false);expect(driver.delivery.id).toBe(1);
  expect(configureHaul(game.ctx,driver.id,{partnerId:driver.id}).ok).toBe(false);
 });
 it('loads directly and preserves a sub-10kg bucket remainder when the truck fills',()=>{
  const {game,operator,driver,digger,truck}=setup();
  assignWorker(game.ctx,operator.id,'dig',{machineId:digger.id,spot:{x:70,z:70,yaw:0}});
  assignWorker(game.ctx,driver.id,'haul',{machineId:truck.id,spot:{x:68,z:70,bed:{x:68,z:70,y:1}}});configureHaul(game.ctx,driver.id,{partnerId:operator.id});
  driver.t=20;operator.phase='dumpAim';digger.load={gravel:0.5};const cap=getStats(game.data,truck).capacity;truck.load={gravel:cap-0.495};
  const heaps=game.ctx.ground.totals().gravel ?? 0;const dumps=[];game.events.on('operatorDump',e=>dumps.push(e));
  staffTick(game.ctx,0.1);expect(operator.loadingMachineId).toBe(truck.id);
  operator.t=0;staffTick(game.ctx,0.1);expect(pileTotal(truck.load)).toBeCloseTo(cap,8);expect(pileTotal(digger.load)).toBeCloseTo(0.005,8);
  expect(dumps[0].intoMachineId).toBe(truck.id);operator.t=0;staffTick(game.ctx,0.1);operator.t=0;staffTick(game.ctx,0.1);
  expect(digger.load).toEqual({});expect((game.ctx.ground.totals().gravel??0)-heaps).toBeCloseTo(0.005,7);
  expect(operator.stats.dug).toBeCloseTo(0.5,2);driver.t=0;staffTick(game.ctx,0.1);expect(driver.phase).toBe('out');
 });
 it('does not teleport a bucket to a distant or away driver',()=>{
  const {game,operator,driver,digger,truck}=setup();assignWorker(game.ctx,operator.id,'dig',{machineId:digger.id,spot:{x:70,z:70}});
  assignWorker(game.ctx,driver.id,'haul',{machineId:truck.id,spot:{x:120,z:120}});configureHaul(game.ctx,driver.id,{partnerId:operator.id});
  digger.load={gravel:0.5};operator.phase='dumpAim';staffTick(game.ctx,0.1);expect(operator.loadingMachineId).toBe(null);
  driver.spot={x:68,z:70};truck.away=true;operator.phase='dumpAim';operator.t=0;staffTick(game.ctx,0.1);expect(operator.loadingMachineId).toBe(null);
 });
 it('earns skill through real completed work, never idle time, retaining agreed wages',()=>{
  const {game,operator,digger}=setup();game.data.staff.experience.dig=0.2;
  ticks(game,200);expect(operator.experience.dig).toBe(0);expect(operator.skills.dig).toBe(1);
  assignWorker(game.ctx,operator.id,'dig',{machineId:digger.id,spot:{x:70,z:70}});ticks(game,150);
  expect(operator.skills.dig).toBeGreaterThan(1);expect(operator.wage).toBe(26);
  expect(operator.skills.dig).toBeLessThanOrEqual(5);
 });
 it('saves trip targets, pairs and experience, resumes away sales, and defaults legacy workers',()=>{
  const {game,driver,truck}=setup();contractsState(game.ctx).active=[job(1,'gravel')];truck.load={gravel:1};
  assignWorker(game.ctx,driver.id,'haul',{machineId:truck.id});configureHaul(game.ctx,driver.id,{delivery:{kind:'job',id:1}});
  for(let i=0;i<100&&!truck.away;i++)staffTick(game.ctx,0.1);expect(truck.away).toBe(true);
  expect(configureHaul(game.ctx,driver.id,{delivery:null}).ok).toBe(false);
  const snapshot=JSON.parse(JSON.stringify(game.snapshot()));const loaded=createGame({state:snapshot});ticks(loaded,5000);
  const d=staffState(loaded.ctx).workers.find(w=>w.id===driver.id);expect(d.stats.loads).toBe(1);expect(d.experience.drive).toBe(1);
  expect(contractsState(loaded.ctx).active[0].delivered).toBe(1);
  delete snapshot.staff.workers[0].experience;delete snapshot.staff.workers[0].partnerId;delete snapshot.staff.workers[0].delivery;
  const legacy=createGame({state:snapshot});expect(staffState(legacy.ctx).workers[0].experience).toEqual({dig:0,drive:0,sell:0,fix:0});
 });
});
