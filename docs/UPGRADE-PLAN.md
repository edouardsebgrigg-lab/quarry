# Working Quarry upgrade

Codex, `codex/quarry-upgrade`. Baseline: published Claude ground/driving work at
`d944458`, including its cleanup and realism changes. Main is still `b7a1adb`.
Edouard requested a substantial plan followed by implementation; this batch grows
the quarry loop without requiring contracts or replacing the existing controls.

## 1. Plan the excavation

Divide the existing field into named work areas. Read actual remaining geological
columns to show sampled cover depth, recoverable materials and bedrock depth.
Choose a work area and follow it with the existing guide/map. Save the selection;
surveys must never mutate terrain, create money or invent reserves.

## 2. Make products from extracted material

Commission a crusher and a screening plant through the existing yard dealer.
Crush broken rock into gravel and sand; screen mixed stockpile batches into a
chosen aggregate and retained rejects. Every tonne must remain accounted for.
Use paid, timed batches with live quotes, input/output capacity reservations,
safe cancellation and running jobs that survive Save/Continue. No free material,
instant remote sales or offline production.

## 3. Run the yard

A clean Quarry operations laptop app joins stockpile inventories, delivery values,
production quotes, active batches, work-area surveys and clear next actions.
Material handling stays physical: load bays with existing vehicles/diggers and
haul the finished material to the depot. Plants get lightweight visible yard
representations and an active status; avoid new downloadable model dependencies.

## 4. See the company grow

Show existing daily logbook income, running costs, investment, digging and sales
alongside processed tonnes. Add optional production milestones and Home shortcuts.
Keep historic saves, existing goals and optional contracts working.

## Acceptance

- Focused logic tests cover conservation, contaminated feed, output/full-bay races,
  reserved cancellation space, duplicate starts, invalid requests, money accounting,
  paused ticks, save/resume and old-save defaults.
- Survey tests prove determinism/read-only behaviour, actual ground changes and
  navigation precedence without changing the player's selected machine.
- Full unit suite, lint, production build and existing browser smoke must pass.
- Browser upgrade check uses real app buttons for quotes, start/cancel, purchases
  and Save/Continue; inspect desktop and narrow screenshots.
- Record actual checks and limits in `docs/LOG.md`. Manual controls, subjective
  audio, a real GPU and a long economy playthrough remain separate coverage limits.

Future batches: additional sites, haul-route planning, deeper maintenance and more
authored world content. Those require their own integrated runtime work; this batch
should deliver a complete usable production loop first.
