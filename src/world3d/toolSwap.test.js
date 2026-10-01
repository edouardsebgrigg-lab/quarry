import {describe,it,expect} from 'vitest';
import {toolSwapBusy} from './toolSwap.js';
describe('runtime attachment swap safety',()=>{
 it('allows a settled empty machine but blocks live work, pouring, joints, slew and travel',()=>{
  const v={busy:()=>false,directState:()=>({moving:false}),feel:()=>({swing:0}),speed:()=>0};
  expect(toolSwapBusy(v,{})).toBe(false);
  expect(toolSwapBusy(v,{job:{type:'dig'}})).toBe(true);
  for(const change of [{busy:()=>true},{directState:()=>({moving:true})},{feel:()=>({swing:.15})},{speed:()=>-.3},{feel:()=>({travel:.3})}]) expect(toolSwapBusy({...v,...change},{})).toBe(true);
 });
 it('does not write cargo or the ephemeral machine state',()=>{
  const m={load:{clay:.05},armPose:{boom:1}};const before=JSON.stringify(m);
  toolSwapBusy({directState:()=>({moving:true})},m);
  expect(JSON.stringify(m)).toBe(before);
 });
});
