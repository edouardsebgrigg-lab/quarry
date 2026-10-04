import { describe, it, expect } from 'vitest';
import { loadData, ticksPerHour } from '../core/index.js';
import { createGame } from '../game/index.js';
import { createGround } from '../ground/index.js';
import { tickBlasting, activeBlast, blastClearance } from './index.js';

const request={x:10,z:10,patternId:'pocket'};
function fixture({cover=0,rock=1}={}) {
  const data=loadData(),plot=data.ground.plots.home;
  plot.width=24;plot.depth=24;plot.surfaceRoll=0;plot.rockDepth=rock;
  plot.strata.forEach(s=>s.thickness=[s.material==='topsoil'?cover:0,s.material==='topsoil'?cover:0]);
  const g=createGame({data,seed:14});g.state.money=1000;
  g.ctx.blastOccupants=()=>[{x:45,z:45,r:0,label:'You'}];
  return g;
}
function finishStage(g) {const p=activeBlast(g.ctx);for(let i=0,n=Math.ceil(p.remainingHours*ticksPerHour(g.data))+1;i<n;i++)tickBlasting(g.ctx);}
function ready(g) {
  expect(g.actions.startBlast(request).ok).toBe(true);finishStage(g);
  expect(g.actions.chargeBlast(activeBlast(g.ctx).id).ok).toBe(true);finishStage(g);
  return activeBlast(g.ctx);
}
function countdown(g) {for(let i=0;i<60;i++)tickBlasting(g.ctx);}
const conserved=(before,after,dug={})=>{for(const m of Object.keys(before))expect((after[m]??0)+(dug[m]??0)).toBeCloseTo(before[m],3);};

describe('finite ground fracturing',()=>{
  it('previews without mutation and turns bedrock into bucket-loadable rubble, conserving all material',()=>{
    const g=fixture({cover:.05}),ground=g.ctx.ground,before=ground.totals(),save=ground.serialize();
    const q=g.actions.quoteBlast(request);
    expect(q.ok).toBe(true);expect(q.tonnes).toBeGreaterThan(10);expect(ground.serialize()).toEqual(save);
    expect(ground.fracture(q.spec,q.signature).ok).toBe(true);
    expect(ground.materialResponseAt(10.25,10.25).loose).toBe(true);
    conserved(before,ground.totals());
    const h=ground.heightAt(10.25,10.25);
    const r=ground.cutSweep({from:{x:10.25,z:10.25,y:h+.01},to:{x:10.25,z:10.25,y:h-.3},tool:'bucket',force:150,width:.8});
    expect(r.tonnes.rock).toBeGreaterThan(0);expect(ground.totals().topsoil).toBeCloseTo(before.topsoil,6);
    ground.settle(4000);conserved(before,ground.totals(),r.tonnes);
    const restored=createGround(g.data.ground,'home',{seed:14});restored.load(JSON.parse(JSON.stringify(ground.serialize())));
    expect(restored.totals()).toEqual(ground.totals());
  });
  it('refuses cover, built ground, invalid numbers and edge-crossing footprints without changing terrain',()=>{
    const g=fixture({cover:.3}),ground=g.ctx.ground,save=ground.serialize();
    expect(g.actions.quoteBlast(request).reason).toMatch(/Strip/);
    for(const input of [{...request,x:1},{...request,z:NaN},{...request,patternId:'bad'}])expect(g.actions.quoteBlast(input).ok).toBe(false);
    const q=g.actions.quoteBlast(request);expect(ground.fracture(q.spec,q.signature).ok).toBe(false);expect(ground.serialize()).toEqual(save);
    const built=fixture({cover:1});
    const plan=built.ctx.ground.buildWorks({ax:8,az:10,bx:14,bz:10,width:3,mode:'level',sourceRadius:6});expect(plan.ok).toBe(true);
    expect(built.actions.quoteBlast(request).reason).toMatch(/unbuilt/);
  });
  it('cannot re-use a survey and stops at the finite rock floor across repeated cuts',()=>{
    const g=fixture({rock:.61}),ground=g.ctx.ground,before=ground.totals();let dug={};
    for(let i=0;i<2;i++) {
      const q=g.actions.quoteBlast(request);expect(q.ok).toBe(true);expect(ground.fracture(q.spec,q.signature).ok).toBe(true);
      expect(ground.fracture(q.spec,q.signature).ok).toBe(false);
      const r=ground.dig({x:10,z:10,radius:3,bottomY:-100});
      for(const [m,t] of Object.entries(r.tonnes))dug[m]=(dug[m]??0)+t;
    }
    expect(g.actions.quoteBlast(request).reason).toMatch(/bottom/);conserved(before,ground.totals(),dug);
  });
  it('rejects a stale survey when the exposed rock is cut with a breaker',()=>{
    const g=fixture(),q=g.actions.quoteBlast(request),ground=g.ctx.ground;
    ground.cutSweep({from:{x:10.25,z:10.25,y:0},to:{x:10.25,z:10.25,y:-.2},force:1000,tool:'breaker',width:.6});
    const before=ground.serialize();expect(ground.fracture(q.spec,q.signature).reason).toMatch(/changed/);expect(ground.serialize()).toEqual(before);
  });
});

describe('contractor preparation and firing',()=>{
  it('charges each stage once, conserves mass and records released tonnes separately from extraction',()=>{
    const g=fixture(),before=g.ctx.ground.totals(),events=[];g.events.on('blastFired',e=>events.push(e));
    const p=ready(g);expect(g.actions.chargeBlast(p.id).ok).toBe(false);
    expect(g.state.money).toBe(970);expect(g.actions.startBlast(request).ok).toBe(false);
    expect(g.actions.fireBlast(p.id).ok).toBe(true);expect(g.actions.fireBlast(p.id).ok).toBe(false);countdown(g);countdown(g);
    expect(events).toHaveLength(1);expect(g.state.blasting.fired).toBe(1);expect(g.state.blasting.releasedTonnes).toBeCloseTo(p.estimatedTonnes,6);
    expect(g.state.stats.tonnesDug).toBe(0);expect(g.state.blasting.history[0]).toMatchObject({status:'fired',cost:30});conserved(before,g.ctx.ground.totals());
  });
  it('does not reserve money for charging and refuses unaffordable operations atomically',()=>{
    const g=fixture();g.state.money=17;const before=structuredClone(g.state);
    expect(g.actions.startBlast(request).ok).toBe(false);expect(g.state).toEqual(before);
    g.state.money=18;g.actions.startBlast(request);finishStage(g);const p=activeBlast(g.ctx);
    expect(g.actions.chargeBlast(p.id).ok).toBe(false);expect(p.stage).toBe('drilled');expect(g.state.money).toBe(0);
  });
  it('counts occupants and vehicle radii, and never trusts missing or malformed live positions',()=>{
    const g=fixture(),p=ready(g);
    delete g.ctx.blastOccupants;expect(g.actions.fireBlast(p.id).ok).toBe(false);
    for(const occupants of [[],[{x:NaN,z:50,r:0}], [{x:50,z:50,r:-1}]]){g.ctx.blastOccupants=()=>occupants;expect(blastClearance(g.ctx,p.id).ok).toBe(false);}
    g.ctx.blastOccupants=()=>[{x:28,z:10,r:3,label:'Truck'},{x:10,z:10,r:0,label:'You'}];
    expect(blastClearance(g.ctx,p.id).blockers).toEqual(['Truck','You']);expect(g.actions.fireBlast(p.id).ok).toBe(false);
  });
  it('aborts when an occupant returns, and requires a new firing command after clearance',()=>{
    const g=fixture(),p=ready(g),before=g.ctx.ground.serialize();g.actions.fireBlast(p.id);
    tickBlasting(g.ctx);g.ctx.blastOccupants=()=>[{x:10,z:10,r:1,label:'Barrow'}];tickBlasting(g.ctx);
    expect(p.stage).toBe('ready');expect(p.holdReason).toMatch(/Barrow/);expect(g.ctx.ground.serialize()).toEqual(before);
    g.ctx.blastOccupants=()=>[{x:50,z:50,r:0,label:'You'}];countdown(g);expect(g.state.blasting.fired).toBe(0);
    g.actions.fireBlast(p.id);expect(g.actions.abortBlast(p.id).ok).toBe(true);countdown(g);expect(g.state.blasting.fired).toBe(0);
    g.actions.fireBlast(p.id);countdown(g);expect(g.state.blasting.fired).toBe(1);
  });
  it('rechecks terrain before charging, firing and on the firing tick',()=>{
    for(const stage of ['drilled','ready','countdown']) {
      const g=fixture();g.actions.startBlast(request);finishStage(g);const p=activeBlast(g.ctx);
      if(stage!=='drilled'){g.actions.chargeBlast(p.id);finishStage(g);}
      if(stage==='countdown')g.actions.fireBlast(p.id);
      g.ctx.ground.deposit({x:10,z:10,radius:1,tonnes:{clay:2}});const before=g.ctx.ground.serialize();
      if(stage==='drilled')expect(g.actions.chargeBlast(p.id).ok).toBe(false);
      else if(stage==='ready')expect(g.actions.fireBlast(p.id).ok).toBe(false);
      else countdown(g);
      expect(g.state.blasting.fired).toBe(0);expect(g.ctx.ground.serialize()).toEqual(before);
    }
  });
  it('saves preparation, safely holds a countdown without live positions, and resumes after re-arming',()=>{
    const g=fixture();g.actions.startBlast(request);tickBlasting(g.ctx);
    const a=createGame({data:g.data,state:JSON.parse(JSON.stringify(g.snapshot()))});
    expect(activeBlast(a.ctx)).toEqual(activeBlast(g.ctx));finishStage(a);a.actions.chargeBlast(activeBlast(a.ctx).id);finishStage(a);
    a.ctx.blastOccupants=g.ctx.blastOccupants;a.actions.fireBlast(activeBlast(a.ctx).id);tickBlasting(a.ctx);
    const b=createGame({data:g.data,state:JSON.parse(JSON.stringify(a.snapshot()))});tickBlasting(b.ctx);expect(activeBlast(b.ctx).stage).toBe('ready');
    b.ctx.blastOccupants=g.ctx.blastOccupants;b.actions.fireBlast(activeBlast(b.ctx).id);countdown(b);expect(b.state.blasting.fired).toBe(1);
  });
  it('cancels with an honest cost receipt and leaves all terrain intact; old saves default empty',()=>{
    const g=fixture(),p=ready(g),before=g.ctx.ground.serialize();g.actions.fireBlast(p.id);
    expect(g.actions.cancelBlast(p.id).ok).toBe(true);countdown(g);expect(g.ctx.ground.serialize()).toEqual(before);expect(g.state.money).toBe(970);
    expect(g.state.blasting.history[0]).toMatchObject({status:'cancelled',cost:30,tonnes:0});expect(activeBlast(g.ctx)).toBe(null);
    const save=structuredClone(g.snapshot());delete save.blasting;const legacy=createGame({data:g.data,state:save});expect(legacy.state.blasting).toMatchObject({projects:[],history:[],fired:0});
  });
  it('holds preparation at other sites and integrates preparation with normal game ticks',()=>{
    const g=fixture();g.actions.startBlast(request);g.tick();const remaining=activeBlast(g.ctx).remainingHours;
    expect(remaining).toBeLessThan(.3);g.state.currentSiteId='elsewhere';countdown(g);expect(g.state.blasting.projects[0].remainingHours).toBe(remaining);
  });
});


it('loads blasted rock through the ordinary digger action and feeds a conserved crusher batch',()=>{
  const g=createGame({seed:14});g.state.money=30000;g.dev.unlockAll();
  g.actions.buyMachine('miniDigger','used');g.actions.buyBuilding('stockpiles');g.actions.buyBuilding('crusher');
  const id=g.state.machines.find(m=>m.type==='miniDigger').id;
  const cover=g.actions.digGround({x:110,z:95,radius:12,bottomY:-100});
  g.actions.dumpGround({x:130,z:130,radius:10,tonnes:cover.tonnes});
  for(let i=0;i<60;i++)g.ctx.ground.settle(20000);
  expect(g.actions.startBlast({x:110,z:95,patternId:'pocket'}).ok).toBe(true);finishStage(g);
  const p=activeBlast(g.ctx);expect(g.actions.chargeBlast(p.id).ok).toBe(true);finishStage(g);
  g.ctx.blastOccupants=()=>[{x:80,z:80,r:0,label:'You'}];expect(g.actions.fireBlast(p.id).ok).toBe(true);g.advance(60);
  const before=g.ctx.ground.totals();let total=0;
  for(let i=0;i<150&&total<1.1;i++) {
    const x=109.25+(i%4)*.5,z=94.25+Math.floor(i/4)%4*.5,h=g.ctx.ground.heightAt(x,z);
    const r=g.actions.bucketCut(id,{x,z,from:{x,z,y:h+.01},to:{x,z,y:h-.3},attack:1});expect(r.ok).toBe(true);
    total+=r.tonnes;expect(g.actions.dumpBucket(id,{stockpileBay:'west'}).ok).toBe(true);
  }
  expect(total).toBeGreaterThanOrEqual(1);
  const load=structuredClone(g.state.stockpiles.home.west);expect(load.rock).toBeGreaterThanOrEqual(1);
  conserved(before,g.ctx.ground.totals(),load);
  expect(g.actions.startProduction({plantId:'crusher',recipeId:'crushRock',sourceBay:'west',outputBay:'middle',tonnes:1}).ok).toBe(true);
  g.advance(30);expect(g.state.stockpiles.home.middle).toEqual({gravel:.8,sand:.2});
});
