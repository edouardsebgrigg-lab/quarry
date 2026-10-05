// Read-only operating advice from real machine/material state; no economy or terrain writes.
import presentation from '../../data/presentation.json';
const clamp=value=>Math.max(0,Math.min(1,Number(value)||0));
export function dominantMaterial(load={}) {
 return Object.entries(load).filter(([,t])=>t>0).sort((a,b)=>b[1]-a[1])[0]?.[0]??null;
}
export function workFeedback({digger=false,attachment='standard',fill=0,full=false,loaded=false,direct=false,blocked=null,resistance=0,force=0,material=null,loose=false,feel={},overloaded=false}) {
 if (feel.engine && !['running','idleOut'].includes(feel.engine)) return null;
 if (overloaded) return {kind:'warn',label:'Towing limit — reduce the load',intensity:1};
 if (digger) {
  if ((full || fill>=1) && attachment!=='breaker') return {kind:'ready',label:'Bucket full — swing to unload',intensity:clamp(fill)};
  if (blocked && attachment==='breaker' && (loose || material!=='rock')) return {kind:'warn',label:loose?'Loose material — use a bucket':'Expose rock — clear soil with a bucket',intensity:1};
  if (material==='rock' && attachment!=='breaker' && (blocked || resistance>force)) return {kind:'warn',label:'Rock face — use the breaker',intensity:1};
  if (blocked || (force>0 && resistance>=force && feel.digging)) return {kind:'warn',label:'Hard cut — take a shallower bite',intensity:1};
  if (feel.relief) return {kind:'warn',label:'Hydraulic limit — ease the lever',intensity:1};
  if (feel.pour>0) return {kind:'active',label:'Pouring material',intensity:clamp(feel.pour)};
  if (feel.digging) return {kind:'active',label:attachment==='breaker'?'Breaking rock':'Cutting material',intensity:clamp(feel.work)};
  if (loaded && !direct && attachment!=='breaker') return {kind:'ready',label:'Bucket loaded — swing to unload',intensity:clamp(fill)};
 } else if ((feel.slip??0)>presentation.workFeedback.highSlip) return {kind:'warn',label:'Low grip — ease the throttle',intensity:clamp(feel.slip)};
 return null;
}
