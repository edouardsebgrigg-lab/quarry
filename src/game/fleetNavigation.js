export const fleetNavigationActions = ctx => ({
  navigateFleet(id) {
    const machine = id && ctx.state.machines.find(m=>m.id===id);
    if (id && (!machine || machine.away || machine.onHire)) return {ok:false,reason:'That machine is away from the yard'};
    ctx.state.player.navigationMachineId = id ?? null;
    if (id) ctx.state.player.selectedMachineId = id;
    ctx.events.emit('fleetNavigationChanged',{machineId:id ?? null});
    return {ok:true};
  },
});
