// Real extracted material moves through paid batches; capacity includes held feed.
import { ownsBuilding, stockpileLoad, stockpileConfig, stockpileRoom, storeStockpile } from '../buildings/index.js';
import { pileTotal, takeProportional } from '../quarry/index.js';
import { canAfford, spendMoney, bestDeliveryQuote } from '../economy/index.js';
import { ticksPerHour, getDate } from '../core/index.js';
import { plantStatus, wearPlant, tickPlantServices } from './plant.js';
export { plantStatus, upgradePlant, servicePlant } from './plant.js';

const EPS = 1e-8;
const roundMoney = n => Math.round(n * 100) / 100;

export function productionState(ctx) {
  ctx.state.production ??= { jobs: [], nextId: 1, processed: 0, batches: 0 };
  ctx.state.production.history ??= [];
  ctx.state.production.plans ??= {};
  ctx.state.production.plants ??= {};
  ctx.state.production.services ??= [];
  return ctx.state.production;
}

// Planning never reserves material or money. Execution always gets a fresh quote.
export function saveProductionPlan(ctx, request = {}) {
  const { plantId, recipeId, sourceBay, outputBay, tonnes } = request ?? {};
  const plant = ctx.data.production.plants[plantId];
  if (!plant || !plant.recipes.includes(recipeId)) return { ok: false, reason: 'Choose a recipe for this plant' };
  if (!stockpileConfig(ctx,sourceBay) || !stockpileConfig(ctx,outputBay) || sourceBay === outputBay) return { ok: false, reason: 'Choose different feed and product bays' };
  if (!Number.isFinite(tonnes) || tonnes < plant.minimumBatch || tonnes > plant.maximumBatch) return { ok: false, reason: `Batch size must be ${plant.minimumBatch}–${plant.maximumBatch} t` };
  const plans = productionState(ctx).plans;
  (plans[ctx.state.currentSiteId] ??= {})[plantId] = { plantId, recipeId, sourceBay, outputBay, tonnes };
  return { ok: true };
}

function recordBatch(ctx, job, status) {
  const {day,hour,minute} = getDate(ctx.state,ctx.data);
  const receipt = { id:job.id, plantId:job.plantId, recipeId:job.recipeId, siteId:job.siteId,
    sourceBay:job.sourceBay, outputBay:job.outputBay, tonnes:job.tonnes, cost:job.cost,
    status, day,hour,minute, output:status==='completed'?{...job.output}:{},
    rejects:status==='completed'?{...job.rejects}:{}, returnedTonnes:status==='cancelled'?job.tonnes:0 };
  const history = productionState(ctx).history;
  history.push(receipt);
  history.splice(0,Math.max(0,history.length-ctx.data.production.historyLimit));
  return receipt;
}

export function quoteProduction(ctx, request = {}) {
  const { plantId, recipeId, sourceBay, outputBay, tonnes } = request ?? {};
  const plant = ctx.data.production.plants[plantId];
  const recipe = ctx.data.production.recipes[recipeId];
  const fail = reason => ({ ok: false, reason });
  if (!plant || !recipe || !plant.recipes.includes(recipeId)) return fail('Choose a recipe for this plant');
  if (!ownsBuilding(ctx, 'stockpiles')) return fail('Commission stockpile bays at the plant dealer first');
  if (!ownsBuilding(ctx, plant.building)) return fail(`Commission the ${plant.name.toLowerCase()} at the plant dealer first`);
  const status=plantStatus(ctx,plantId);
  if(status.service)return fail('This plant is being serviced');
  if(status.condition<ctx.data.production.maintenance.minimumCondition)return fail('Service this plant before starting another batch');
  if ((ctx.state.production?.jobs ?? []).some(j => j.plantId === plantId && j.siteId === ctx.state.currentSiteId)) return fail('This plant already has a batch running');
  if (!stockpileConfig(ctx, sourceBay) || !stockpileConfig(ctx, outputBay) || sourceBay === outputBay) return fail('Choose different feed and product bays');
  if (!Number.isFinite(tonnes) || tonnes < plant.minimumBatch || tonnes > plant.maximumBatch) return fail(`Batch size must be ${plant.minimumBatch}–${plant.maximumBatch} t`);
  const feed = stockpileLoad(ctx, sourceBay);
  const available = pileTotal(feed);
  if (available + EPS < tonnes) return fail('Not enough material in the feed bay');
  const input = Object.fromEntries(Object.entries(feed).filter(([,t]) => t > EPS).map(([id,t]) => [id, t * tonnes / available]));
  const output = {}, rejects = {};
  if (recipe.input) {
    if (Object.entries(input).some(([id,t]) => id !== recipe.input && t > EPS)) return fail('The crusher needs clean broken rock; keep soil and other aggregates in a separate bay');
    for (const [id, share] of Object.entries(recipe.outputs)) output[id] = tonnes * share;
  } else {
    for (const [id,t] of Object.entries(input)) (id === recipe.separate ? output : rejects)[id] = t;
    if (pileTotal(output) < EPS) return fail(`The feed contains no ${ctx.data.materials[recipe.separate].name.toLowerCase()}`);
  }
  const outputTonnes = pileTotal(output);
  if (stockpileRoom(ctx, outputBay) + EPS < outputTonnes) return fail('Product bay has too little unreserved space; empty it before starting');
  const cost = roundMoney(tonnes * plant.costPerTonne * status.costFactor);
  if (!canAfford(ctx, cost)) return fail('Not enough money for this batch');
  const inputValue = bestDeliveryQuote(ctx, input).gross;
  const outputValue = bestDeliveryQuote(ctx, output).gross + (pileTotal(rejects) ? bestDeliveryQuote(ctx, rejects).gross : 0);
  return { ok: true, plantId, recipeId, sourceBay, outputBay, tonnes, input, output, rejects,
    outputTonnes, cost, hours: tonnes / (plant.tonnesPerHour*status.throughput), inputValue, outputValue,
    estimatedUplift: roundMoney(outputValue - inputValue - cost), siteId: ctx.state.currentSiteId };
}

export function startProduction(ctx, request) {
  const quote = quoteProduction(ctx, request);
  if (!quote.ok) return quote;
  const st = productionState(ctx);
  // Reserve all held feed space too: cancellation and screening rejects always fit.
  const job = { ...quote, id: `batch-${st.nextId++}`, remainingHours: quote.hours,
    reservations: { [quote.sourceBay]: quote.tonnes, [quote.outputBay]: quote.outputTonnes } };
  delete job.ok;
  takeProportional(stockpileLoad(ctx, quote.sourceBay), quote.tonnes);
  st.jobs.push(job);
  saveProductionPlan(ctx,quote);
  spendMoney(ctx, quote.cost, `production:${quote.plantId}`);
  ctx.events.emit('stockpileChanged', { siteId: quote.siteId, bayId: quote.sourceBay });
  ctx.events.emit('productionStarted', { jobId: job.id, plantId: job.plantId, tonnes: job.tonnes, cost: job.cost });
  return { ok: true, jobId: job.id };
}

export function cancelProduction(ctx, id) {
  const st = productionState(ctx);
  const job = st.jobs.find(j => j.id === id && j.siteId === ctx.state.currentSiteId);
  if (!job) return { ok: false, reason: 'No running batch with that ID at this site' };
  // Validate before releasing the reservation, including any vehicle tips in flight.
  if (stockpileRoom(ctx, job.sourceBay, job.siteId, null, job.id) + EPS < job.tonnes) return { ok: false, reason: 'Feed bay is blocked; make room before cancelling' };
  st.jobs = st.jobs.filter(j => j.id !== id);
  storeStockpile(ctx, job.sourceBay, { ...job.input }, job.siteId);
  recordBatch(ctx,job,'cancelled');
  ctx.events.emit('productionCancelled', { jobId: id, plantId: job.plantId });
  return { ok: true, returnedTonnes: job.tonnes, cost: job.cost };
}

export function tickProduction(ctx) {
  const st = productionState(ctx);
  tickPlantServices(ctx);
  for (const job of [...st.jobs]) {
    job.remainingHours = Math.max(0, job.remainingHours - 1 / ticksPerHour(ctx.data));
    if (job.remainingHours > EPS) continue;
    const rejectTonnes = pileTotal(job.rejects);
    if (stockpileRoom(ctx, job.outputBay, job.siteId, null, job.id) + EPS < job.outputTonnes
      || stockpileRoom(ctx, job.sourceBay, job.siteId, null, job.id) + EPS < rejectTonnes) {
      job.blocked = true;
      continue;
    }
    st.jobs = st.jobs.filter(j => j.id !== job.id);
    storeStockpile(ctx, job.outputBay, { ...job.output }, job.siteId);
    if (rejectTonnes > EPS) storeStockpile(ctx, job.sourceBay, { ...job.rejects }, job.siteId);
    st.processed += job.tonnes;
    st.batches += 1;
    wearPlant(ctx,job);
    recordBatch(ctx,job,'completed');
    ctx.events.emit('productionCompleted', { jobId: job.id, plantId: job.plantId, siteId: job.siteId,
      sourceBay: job.sourceBay, outputBay: job.outputBay,
      tonnes: job.tonnes, output: { ...job.output }, rejects: { ...job.rejects } });
  }
}
