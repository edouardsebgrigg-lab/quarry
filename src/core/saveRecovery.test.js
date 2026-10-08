import {it,expect} from 'vitest';
import {createMemoryStorage,createSaveSystem,loadData,migrations} from './index.js';
import {createGame} from '../game/index.js';
import {validateSavedGame} from '../game/saveValidation.js';

// Every save check rebuilds the whole company from the file (about 0.2 s each), so these take a
// second or two alone and more while the machine is busy.
const slow={timeout:20000};

it('keeps an independent previous revision and recovers a damaged primary',()=>{
 const storage=createMemoryStorage(),s=createSaveSystem({storage,version:1});
 s.save('slot1',{money:4});s.save('slot1',{money:9});
 expect(s.load('slot1',{backup:true})).toEqual({money:4});
 storage.setItem('quarry.save.slot1','{broken');
 expect(s.list().find(x=>x.slotId==='slot1')).toMatchObject({corrupt:true,hasBackup:true});
 expect(s.loadWithInfo('slot1')).toMatchObject({recovered:true,state:{money:4}});
 s.save('slot1',{money:12});expect(s.load('slot1')).toEqual({money:12});expect(s.load('slot1',{backup:true})).toEqual({money:4});
});
it('detects valid JSON that no longer matches its integrity check',()=>{
 const storage=createMemoryStorage(),s=createSaveSystem({storage,version:1});s.save('slot1',{money:5});
 const record=JSON.parse(storage.getItem('quarry.save.slot1'));record.state.money=500;
 storage.setItem('quarry.save.slot1',JSON.stringify(record));
 expect(()=>s.load('slot1')).toThrow(/integrity/);expect(s.list()[1].corrupt).toBe(true);
});
it('never destroys the primary when recovery storage or the next write runs out of space',()=>{
 for(const blocked of ['quarry.save.slot1.backup','quarry.save.slot1']) {
  const memory=createMemoryStorage();let fail=false;
  const storage={...memory,setItem(k,v){if(fail&&k===blocked)throw Error('Storage full');memory.setItem(k,v);}};
  const s=createSaveSystem({storage,version:1});s.save('slot1',{money:5});fail=true;
  expect(()=>s.save('slot1',{money:10})).toThrow('Storage full');expect(s.load('slot1')).toEqual({money:5});
 }
});
it('exports, validates and imports into the chosen slot without changing the source or paying anything',slow,()=>{
 const data=loadData(),storage=createMemoryStorage(),s=createSaveSystem({storage,version:6,migrations,validateState:state=>validateSavedGame(data,state)});
 const g=createGame({data,seed:7});g.actions.shovelDig({x:20,z:20});s.save('slot1',g.snapshot(),{company:'Stone Co.',day:1});
 const text=s.exportSave('slot1'),before=s.load('slot1');expect(s.inspectImport(text).summary.company).toBe('Stone Co.');
 s.importSave('slot2',text);expect(s.load('slot2')).toEqual(before);expect(s.load('slot1')).toEqual(before);
 expect(()=>s.importSave('autosave',text)).toThrow(/manual/);
 const r=createGame({data,state:s.load('slot2')});expect(r.ctx.ground.totals()).toEqual(g.ctx.ground.totals());
});
it('rejects bad, oversized and future imports before any slot changes; exports newer saves intact',()=>{
 const storage=createMemoryStorage(),s=createSaveSystem({storage,version:2,maxImportBytes:512});s.save('slot1',{money:3});
 for(const text of ['','not JSON','{}',' '.repeat(513),JSON.stringify({format:'another-game',version:2,savedAt:0,state:{},summary:{}}),JSON.stringify({version:3,savedAt:0,state:{},summary:{}})])expect(()=>s.importSave('slot1',text)).toThrow();
 expect(s.load('slot1')).toEqual({money:3});
 createSaveSystem({storage,version:3}).save('slot2',{money:9});
 expect(JSON.parse(s.exportSave('slot2')).version).toBe(3);expect(()=>s.save('slot2',{})).toThrow(/newer-version/);
});
it('validates imported terrain before displacing an existing save and accepts legacy metadata',slow,()=>{
 const data=loadData(),storage=createMemoryStorage(),s=createSaveSystem({storage,version:6,migrations,validateState:state=>validateSavedGame(data,state)});
 const g=createGame({data,seed:8});s.save('slot1',g.snapshot());const before=storage.getItem('quarry.save.slot1');
 const old={version:6,savedAt:100,summary:{},state:structuredClone(g.snapshot())};expect(s.inspectImport(JSON.stringify(old)).version).toBe(6);
 old.state.ground.format=999;expect(()=>s.importSave('slot1',JSON.stringify(old))).toThrow(/terrain format/);
 expect(storage.getItem('quarry.save.slot1')).toBe(before);
 for(const state of [{money:1},{...g.state,machines:[{id:'bad',type:'no-such-vehicle'}]}])expect(()=>validateSavedGame(data,state)).toThrow(/usable/);
});
it('isolates migrated loads and reports blocked storage without breaking the menu',()=>{
 const storage=createMemoryStorage();createSaveSystem({storage,version:1}).save('slot1',{money:3});
 const s=createSaveSystem({storage,version:2,migrations:{1:x=>({...x,upgraded:true})}});const first=s.load('slot1');first.money=99;
 expect(s.load('slot1')).toEqual({money:3,upgraded:true});
 const blocked=createSaveSystem({storage:{getItem(){throw Error('Storage disabled');}},version:1});expect(blocked.latest()).toBeNull();expect(blocked.list()[0].error).toBe('Storage disabled');
});
it('exports the current company when browser storage is unavailable',slow,()=>{
 const data=loadData(),g=createGame({data,seed:19});g.actions.shovelDig({x:30,z:20});
 const s=createSaveSystem({storage:{getItem(){throw Error('Blocked');},setItem(){throw Error('Full');}},
  version:data.game.saveVersion,migrations,validateState:state=>validateSavedGame(data,state)});
 const text=s.exportState(g.snapshot(),{company:'Independent Stone',day:1});
 expect(s.inspectImport(text).state).toEqual(g.snapshot());
 expect(s.inspectImport(text).summary.company).toBe('Independent Stone');
});
