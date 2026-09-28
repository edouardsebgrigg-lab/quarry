// A pile is a plain object { materialId: tonnes }.

const EPS = 1e-9;

export function pileTotal(pile) {
  let total = 0;
  for (const t of Object.values(pile)) total += t;
  return total;
}

export function addToPile(pile, materials) {
  for (const [id, t] of Object.entries(materials)) {
    if (t <= 0) continue;
    pile[id] = (pile[id] ?? 0) + t;
  }
}

// Takes tonnes from the pile proportionally across its materials.
export function takeProportional(pile, tonnes) {
  const total = pileTotal(pile);
  const amount = Math.min(tonnes, total);
  const taken = {};
  if (amount <= EPS) return taken;
  const share = amount / total;
  for (const [id, t] of Object.entries(pile)) {
    const part = t * share;
    taken[id] = part;
    pile[id] = t - part;
    if (pile[id] <= EPS) delete pile[id];
  }
  return taken;
}

// Takes tonnes of one material. Returns the amount actually taken.
export function takeMaterial(pile, id, tonnes) {
  const have = pile[id] ?? 0;
  const amount = Math.min(have, tonnes);
  pile[id] = have - amount;
  if (pile[id] <= EPS) delete pile[id];
  return amount;
}
