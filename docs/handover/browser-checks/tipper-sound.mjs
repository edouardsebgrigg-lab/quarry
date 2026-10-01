// S2 browser API check, muted: initialise Web Audio, create/set/stop new loops.
import assert from 'node:assert/strict';
import {start} from './common.mjs';
const {browser,q,newGame,frames,errors}=await start();
try{
 await newGame();
 await q(async()=>{const {createAudio}=await import('/src/audio/index.js');window.__tipAudio=createAudio({volume:0});window.__tipAudio.resume();});
 await frames(6);
 const result=await q(()=>{const a=window.__tipAudio;if(!a.ready())return {ready:false};const ram=a.loopVoice('tipperRam'),pto=a.loopVoice('pto');ram.set({gain:0.4,rate:1,pos:{x:0,y:0,z:0}});pto.set({gain:0.2,rate:1,pos:{x:0,y:0,z:0}});ram.set({gain:0,rate:0.75});pto.set({gain:0});ram.stop();pto.stop();return {ready:true,ram:!!ram,pto:!!pto};});
 assert.deepEqual(result,{ready:true,ram:true,pto:true});await frames(30);assert.deepEqual(errors,[]);console.log(JSON.stringify({result,errors}));
}finally{await browser.close();}
