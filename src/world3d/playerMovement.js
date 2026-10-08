import handling from '../../data/handling.json';

// Pure movement state; Rapier resolves the requested displacement and feeds the result back.
// `input.wading` is how deep the water is round your feet (metres): it slows you down.
export function createPlayerMovement(tuning = handling.player, wade = handling.wading) {
  const state = { x:0, z:0, vy:0, grounded:false, coyote:0, buffer:0, jumpDown:false, spent:false,
    speed:0, forwardSpeed:0, strafeSpeed:0, moving:false, sprinting:false, constrained:false, landed:false, landingSpeed:0,landingT:0 };
  let lastYaw = 0;
  return {
    state,
    reset(jumpDown = false) {
      Object.assign(state, {x:0,z:0,vy:0,grounded:false,coyote:0,buffer:0,jumpDown,spent:false,
        speed:0,forwardSpeed:0,strafeSpeed:0,moving:false,sprinting:false,constrained:false,landed:false,landingSpeed:0,landingT:0});
    },
    step(dt, input, yaw = 0) {
      if (!Number.isFinite(dt) || dt <= 0) return {x:0,y:0,z:0,jumped:false};
      dt = Math.min(dt, tuning.maxStepSeconds);
      state.landingT=Math.max(0,state.landingT-dt);
      state.landed=state.landingT>0;
      if(!state.landed)state.landingSpeed=0;
      lastYaw = input.moveYaw ?? yaw;
      const fx=-Math.sin(lastYaw),fz=-Math.cos(lastYaw),rx=-fz,rz=fx;
      let x=fx*input.forward+rx*input.right,z=fz*input.forward+rz*input.right;
      const length=Math.hypot(x,z);
      if(length>1){x/=length;z/=length;}
      const depth=input.wading>=wade.minDepth?input.wading:0;
      const speed=(input.maxSpeed ?? (input.sprint?tuning.sprintSpeed:tuning.walkSpeed))*Math.max(wade.walkSlowest,1-depth*wade.walkSlowPerMetre);
      const tx=x*speed,tz=z*speed;
      state.constrained=input.maxSpeed!=null;
      state.sprinting=!!input.sprint&&!state.constrained&&length>0;
      if(state.constrained){state.x=tx;state.z=tz;} // A stopped barrow must not coast into a parked machine.
      else {
        const reversing=state.x*tx+state.z*tz<0;
        const rate=state.grounded?(length===0?tuning.groundDeceleration:reversing?tuning.reversalAcceleration:tuning.groundAcceleration)
          :(length===0?tuning.airDeceleration:tuning.airAcceleration);
        const delta=Math.hypot(tx-state.x,tz-state.z);
        const share=delta>0?Math.min(1,rate*dt/delta):0;
        state.x+=(tx-state.x)*share;state.z+=(tz-state.z)*share;
      }
      state.coyote=state.grounded&&!state.spent?tuning.coyoteSeconds:Math.max(0,state.coyote-dt);
      state.buffer=Math.max(0,state.buffer-dt);
      if(input.jump&&!state.jumpDown&&!state.constrained)state.buffer=tuning.jumpBufferSeconds;
      state.jumpDown=!!input.jump;
      let jumped=false;
      if(state.buffer>0&&!state.spent&&(state.grounded||state.coyote>0)){
        state.vy=tuning.jumpSpeed;state.buffer=0;state.coyote=0;state.spent=true;state.grounded=false;jumped=true;
      }
      const nextVertical=Math.max(-tuning.terminalFallSpeed,state.vy-tuning.gravity*dt);
      const vertical=(state.vy+nextVertical)*.5*dt;
      state.vy=nextVertical;
      return {x:state.x*dt,y:vertical,z:state.z*dt,jumped};
    },
    resolve(dt, movement, grounded, desired = null) {
      if(!(dt>0))return;
      const wasGrounded=state.grounded;
      if(grounded&&!wasGrounded&&state.vy<=0){
        state.landed=true;state.landingSpeed=Math.max(0,-state.vy);state.landingT=tuning.landingMemorySeconds;
      }
      state.grounded=!!grounded;
      if(state.vy>0&&desired?.y>0&&movement.y<desired.y*.25)state.vy=0;
      if(grounded&&state.vy<=0){state.vy=0;state.spent=false;}
      // Drop blocked velocity instead of building invisible momentum against a wall.
      state.x=movement.x/dt;state.z=movement.z/dt;
      state.speed=Math.hypot(state.x,state.z);
      state.forwardSpeed=state.x*-Math.sin(lastYaw)+state.z*-Math.cos(lastYaw);
      state.strafeSpeed=state.x*Math.cos(lastYaw)+state.z*-Math.sin(lastYaw);
      state.moving=state.speed>tuning.movingThreshold;
    },
  };
}
