// Runtime-only motion gate; the authoritative fleet action validates cargo and compatibility.
import presentation from '../../data/presentation.json';
export function toolSwapBusy(vehicle, machine) {
  if (machine?.job || vehicle?.busy?.()) return true;
  if (vehicle?.directState?.().moving) return true;
  const feel = vehicle?.feel?.() ?? {};
  return Math.abs(feel.swing ?? 0) > presentation.tools.stationarySlew
    || Math.max(Math.abs(vehicle?.speed?.() ?? 0), Math.abs(feel.travel ?? 0)) > presentation.tools.stationaryTravel;
}
