// Sites, zones and rock layers.
import { addToPile, pileTotal, takeProportional, takeMaterial } from './piles.js';

const EPS = 1e-6;

export function createSitesState(data) {
  const sites = {};
  for (const [id, site] of Object.entries(data.sites)) {
    const zones = {};
    for (const z of site.zones) zones[z.id] = { dug: 0 };
    sites[id] = {
      owned: !!site.startOwned,
      selectedZoneId: site.zones[0].id,
      zones,
      facePile: {},
      yard: {},
    };
  }
  return sites;
}

export function getSiteData(data, siteId) {
  const site = data.sites[siteId];
  if (!site) throw new Error(`Unknown site ${siteId}`);
  return site;
}

function zoneLayers(siteData, zoneId) {
  const zone = siteData.zones.find((z) => z.id === zoneId);
  if (!zone) throw new Error(`Unknown zone ${zoneId}`);
  return zone.layers ?? siteData.layerProfile;
}

// Everything the game needs to know about a zone right now.
export function getZoneInfo(ctx, siteId, zoneId) {
  const siteData = getSiteData(ctx.data, siteId);
  const layers = zoneLayers(siteData, zoneId);
  const dug = ctx.state.sites[siteId].zones[zoneId].dug;
  const perLayer = siteData.tonnesPerLayer;
  const totalTonnes = perLayer * layers.length;
  const exhausted = dug >= totalTonnes - EPS;
  const layerIndex = exhausted ? layers.length - 1 : Math.floor((dug + EPS) / perLayer);
  return {
    zoneId,
    name: siteData.zones.find((z) => z.id === zoneId).name,
    layerIndex,
    layer: layers[layerIndex],
    layerCount: layers.length,
    depth: (dug / perLayer) * siteData.layerThickness,
    maxDepth: layers.length * siteData.layerThickness,
    remainingInLayer: exhausted ? 0 : (layerIndex + 1) * perLayer - dug,
    remainingTotal: Math.max(0, totalTonnes - dug),
    exhausted,
  };
}

export function selectZone(ctx, siteId, zoneId) {
  const site = ctx.state.sites[siteId];
  if (!site.zones[zoneId]) return { ok: false, reason: 'Unknown zone' };
  site.selectedZoneId = zoneId;
  ctx.events.emit('zoneSelected', { siteId, zoneId });
  return { ok: true };
}

// Removes rock from the current layer of a zone (never crosses into the next layer).
// Returns { tonnes, materials }.
export function extractRock(ctx, siteId, zoneId, tonnes) {
  const info = getZoneInfo(ctx, siteId, zoneId);
  const amount = Math.min(tonnes, info.remainingInLayer);
  if (amount <= EPS) return { tonnes: 0, materials: {} };
  const materials = {};
  for (const [id, share] of Object.entries(info.layer.mix)) materials[id] = amount * share;
  const zone = ctx.state.sites[siteId].zones[zoneId];
  zone.dug += amount;
  // Snap to layer boundaries so float rounding never leaves a sliver behind.
  const perLayer = getSiteData(ctx.data, siteId).tonnesPerLayer;
  const nearest = Math.round(zone.dug / perLayer) * perLayer;
  if (Math.abs(zone.dug - nearest) < 1e-6) zone.dug = nearest;
  const after = getZoneInfo(ctx, siteId, zoneId);
  if (after.layerIndex !== info.layerIndex || after.exhausted) {
    ctx.events.emit('layerFinished', { siteId, zoneId, exhausted: after.exhausted, depth: after.depth });
  }
  return { tonnes: amount, materials };
}

// ---- face pile & yard ----

export function facePileTotal(ctx, siteId) {
  return pileTotal(ctx.state.sites[siteId].facePile);
}

export function facePileRoom(ctx, siteId) {
  return Math.max(0, getSiteData(ctx.data, siteId).facePileCapacity - facePileTotal(ctx, siteId));
}

export function addToFacePile(ctx, siteId, materials) {
  addToPile(ctx.state.sites[siteId].facePile, materials);
}

export function takeFromFacePile(ctx, siteId, tonnes) {
  return takeProportional(ctx.state.sites[siteId].facePile, tonnes);
}

export function yardTotal(ctx, siteId) {
  return pileTotal(ctx.state.sites[siteId].yard);
}

export function yardRoom(ctx, siteId) {
  return Math.max(0, getSiteData(ctx.data, siteId).yardCapacity - yardTotal(ctx, siteId));
}

export function yardAmount(ctx, siteId, productId) {
  return ctx.state.sites[siteId].yard[productId] ?? 0;
}

// Adds to the yard up to its capacity. Returns the tonnes that did not fit.
export function addToYard(ctx, siteId, materials) {
  const room = yardRoom(ctx, siteId);
  const total = pileTotal(materials);
  if (total <= EPS) return 0;
  const fit = Math.min(1, room / total);
  const accepted = {};
  for (const [id, t] of Object.entries(materials)) accepted[id] = t * fit;
  addToPile(ctx.state.sites[siteId].yard, accepted);
  return total * (1 - fit);
}

export function takeFromYard(ctx, siteId, productId, tonnes) {
  return takeMaterial(ctx.state.sites[siteId].yard, productId, tonnes);
}
