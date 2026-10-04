import {describe,it,expect} from 'vitest';
import {createGame} from '../game/index.js';
import {loadData} from '../core/index.js';
import {stockpileConfig,stockpileRoom,stockpileLoad,storeStockpile} from './index.js';
const setup=()=>{const data=loadData();data.milestones.list=[];const g=createGame({data});g.state.money=20000;g.actions.buyBuilding('stockpiles');return g;};
describe('individual bay expansion',()=>{
 it('charges for each level once and increases capacity without changing inventory',()=>{
  const g=setup();storeStockpile(g.ctx,'west',{rock:25});const cash=g.state.money;
  expect(g.actions.upgradeStockpile('west')).toMatchObject({ok:true,capacity:40});expect(g.state.money).toBe(cash-400);
  expect(stockpileLoad(g.ctx,'west')).toEqual({rock:25});expect(stockpileRoom(g.ctx,'west')).toBe(15);expect(stockpileRoom(g.ctx,'east')).toBe(25);
  expect(g.actions.upgradeStockpile('west').capacity).toBe(55);expect(g.state.money).toBe(cash-1250);
  const before=JSON.stringify(g.snapshot());expect(g.actions.upgradeStockpile('west').ok).toBe(false);expect(JSON.stringify(g.snapshot())).toBe(before);
  expect(g.state.logbook.days.at(-1).invested).toBe(1850);
 });
 it('preserves arriving-load and production reservations across upgrades and Continue',()=>{
  const g=setup();g.actions.buyBuilding('crusher');storeStockpile(g.ctx,'west',{rock:10});
  g.actions.startProduction({plantId:'crusher',recipeId:'crushRock',sourceBay:'west',outputBay:'middle',tonnes:10});
  const m=g.state.machines[0];m.load={gravel:5};g.actions.tip(m.id,{stockpileBay:'middle'});
  const room=stockpileRoom(g.ctx,'middle');expect(room).toBe(10);
  g.actions.upgradeStockpile('middle');expect(stockpileRoom(g.ctx,'middle')).toBe(room+15);
  const old=createGame({state:JSON.parse(JSON.stringify(g.snapshot())),data:g.data});expect(stockpileRoom(old.ctx,'middle')).toBe(25);
  expect(stockpileConfig(old.ctx,'middle').upgrade.wallHeight).toBe(2.7);
  g.actions.cancelProduction(g.state.production.jobs[0].id);expect(stockpileLoad(g.ctx,'west').rock).toBe(10);
 });
 it('refuses invalid, unowned or unaffordable upgrades and defaults older saves per site',()=>{
  const g=setup();g.state.money=0;const before=JSON.stringify(g.snapshot());
  expect(g.actions.upgradeStockpile('west').ok).toBe(false);expect(g.actions.upgradeStockpile('bad').ok).toBe(false);expect(JSON.stringify(g.snapshot())).toBe(before);
  const fresh=createGame();expect(fresh.actions.upgradeStockpile('west').ok).toBe(false);
  g.state.money=1000;g.actions.upgradeStockpile('west');expect(stockpileConfig(g.ctx,'west','other').capacity).toBe(25);
  const saved=JSON.parse(JSON.stringify(g.snapshot()));delete saved.stockpileUpgrades;
  expect(stockpileConfig(createGame({state:saved,data:g.data}).ctx,'west').capacity).toBe(25);
 });
});
