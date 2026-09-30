// Big studio photos of every machine, rendered by the game itself (the laptop's product-photo
// renderer, with the game's models and weathering), from a few angles, for model reviews.
// OUT=<dir> TAG=<name> [ONLY=type,type] node docs/handover/browser-checks/modelshots.mjs
import { writeFileSync } from 'node:fs';
import { start } from './common.mjs';
const TAG = process.env.TAG ?? 'model';
const only = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
const { browser, errors, q, newGame } = await start({ width: 320, height: 180 });
await newGame();
const views = { front: { yaw: 0.76, pitch: 0.28 }, back: { yaw: 3.9, pitch: 0.3 }, close: { yaw: 0.5, pitch: 0.15, zoom: 0.55 } };
for (const type of ['miniDigger', 'excavator', 'dumper', 'tractor', 'truck', 'pickup']) {
  if (only && !only.has(type)) continue;
  for (const tier of type === 'pickup' ? ['rusty'] : ['rusty', 'used']) {
    for (const [name, view] of Object.entries(views)) {
      const url = await q(([type, tier, view]) => {
        window.__photos ??= window.__quarry.world.createProductPhotos({ width: 1200, height: 750 });
        return window.__photos.photo(type, tier, view);
      }, [type, tier, view]);
      if (!url) { console.log('no photo', type, tier); continue; }
      writeFileSync(`${process.env.OUT}/${TAG}-${type}-${tier}-${name}.png`, Buffer.from(url.split(',')[1], 'base64'));
      console.log('shot', type, tier, name);
    }
  }
}
console.log('errors', errors.slice(0, 10).join('\n') || '(none)');
await browser.close();
