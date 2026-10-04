# Regional and industrial expansion

Owner-directed expansion beyond the existing task queue, on `codex/quarry-expansion`.

The connected play loop is now: survey and record a work area, extract and separate real
material, process it in an upgradeable plant, compare regional outlets, weigh and deliver,
and reinvest in throughput and supplier relationships. Contracts remain optional.

Implemented scope:
- Three new modelled roadside businesses with dedicated scales and unloading pads.
- Daily demand, price/purity differences, two supplier relationship improvements,
  partial-load sales, receipts, regional map markers and delivery navigation.
- Two upgrade steps per processing plant, output wear, throughput degradation and timed
  paid service, with saved progress and visible workshop state.
- Saved survey baselines with per-material reserve changes.

All additions load into existing saves. New game balance is in `data/trade.json` and
`data/production.json`. The browser expansion check uses explicit money, wear, cargo and
vehicle-placement fixtures. It does not establish a human driving playthrough or real-GPU
performance. No new owned excavation plots or player-built factory placement are claimed.

Verification cases cover simultaneous demand reservations, save/resume, changed cargo,
partial trailer loads, daily demand renewal, supplier pricing, contract isolation, conserved
plant yields, upgrade cost/duration, paid service across saves, legacy plant defaults and
survey persistence. The browser script also checks all three public scales using explicit
placements and a shortened dwell, followed by the world T-action dispatch.
