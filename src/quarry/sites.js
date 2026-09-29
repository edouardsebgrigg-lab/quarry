// Sites you own. Each one has a plot of real, diggable ground (src/ground); what you dig
// there is carried off in barrows, beds and buckets, and sold at the depot.

export function createSitesState(data) {
  const sites = {};
  for (const [id, site] of Object.entries(data.sites)) sites[id] = { owned: !!site.startOwned };
  return sites;
}

export function getSiteData(data, siteId) {
  const site = data.sites[siteId];
  if (!site) throw new Error(`Unknown site ${siteId}`);
  return site;
}
