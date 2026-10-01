// Small, optional motion cues; operate on physical travel rather than held input.
import presentation from '../../data/presentation.json';
const C=presentation.camera;
export function createFootCameraFeel() {
 let phase=0,amount=0,landing=0,fovBoost=0,wasLanded=false;
 return {
  reset(){phase=amount=landing=fovBoost=0;wasLanded=false;},
  update(dt,motion={},strength=1){
   const step=Number.isFinite(dt)?Math.max(0,Math.min(dt,.05)):0;
   const scale=Number.isFinite(strength)?Math.max(0,Math.min(1,strength)):1;
   if(step>0){
    const blend=-Math.expm1(-C.blendRate*step),speed=Math.max(0,motion.speed??0);
    phase+=speed*step/C.strideLength*Math.PI*2;
    const target=motion.grounded&&!motion.constrained?Math.min(1,speed/C.referenceSpeed):0;
    amount+=(target-amount)*blend;
    if(motion.landed&&!wasLanded)landing=Math.min(C.landingDropMax,Math.max(0,motion.landingSpeed??0)*C.landingImpactScale);
    else landing*=Math.exp(-C.landingReleaseRate*step);
    wasLanded=!!motion.landed;
    fovBoost+=((motion.sprinting?C.sprintFov*target:0)-fovBoost)*blend;
   }
   if(scale===0)return {height:0,roll:0,fov:0};
   return {height:(Math.sin(phase*2)*C.walkBobHeight*amount-landing)*scale,roll:Math.sin(phase)*C.walkBobRoll*amount*scale,fov:fovBoost*scale};
  },
 };
}
