import {describe,it,expect} from 'vitest';
import {workFeedback,dominantMaterial} from './workTelemetry.js';
const running={engine:'running'};
describe('operating feedback',()=>{
 it('uses real load identity and remains read only',()=>{const load={clay:.5,sand:2,rock:0};expect(dominantMaterial(load)).toBe('sand');expect(load).toEqual({clay:.5,sand:2,rock:0});expect(dominantMaterial({})).toBeNull();});
 it('distinguishes full buckets, rock needing a breaker and hydraulic end stops',()=>{
  expect(workFeedback({digger:true,fill:1,feel:running}).label).toContain('Bucket full');
  expect(workFeedback({digger:true,material:'rock',blocked:'rock',feel:running}).label).toContain('breaker');
  expect(workFeedback({digger:true,material:'rock',attachment:'breaker',feel:{...running,digging:true}}).label).toBe('Breaking rock');
  expect(workFeedback({digger:true,feel:{...running,relief:true}}).label).toContain('Hydraulic limit');
 });
 it('prioritizes towing overload and suppresses misleading advice with an engine off',()=>{
  expect(workFeedback({overloaded:true,feel:{...running,slip:.8}}).label).toContain('Towing limit');
  expect(workFeedback({digger:true,fill:1,feel:{engine:'off'}})).toBeNull();
  expect(workFeedback({feel:{...running,slip:.5}}).label).toContain('Low grip');
  expect(workFeedback({feel:{...running,slip:.1}})).toBeNull();
 });
 it('uses the physical bucket full rule and advises the right tool for loose rubble',()=>{
  expect(workFeedback({digger:true,fill:.93,full:true,feel:running}).label).toContain('Bucket full');
  expect(workFeedback({digger:true,fill:.99,full:false,feel:running})).toBeNull();
  expect(workFeedback({digger:true,attachment:'breaker',material:'rock',loose:true,blocked:true,feel:running}).label).toContain('use a bucket');
 });
 it('a partial Assisted bite calls for unloading while Direct can keep cutting',()=>{
  const sample={digger:true,loaded:true,full:false,fill:.02,feel:running};
  expect(workFeedback(sample).label).toBe('Bucket loaded — swing to unload');
  expect(workFeedback({...sample,direct:true})).toBeNull();
  expect(workFeedback({...sample,feel:{...running,digging:true}}).label).toBe('Cutting material');
  expect(workFeedback({...sample,feel:{...running,pour:.3}}).label).toBe('Pouring material');
 });
});
