// The yard's logbook: what each machine has done, a summary of each day, and every message
// Ray has sent. Built from game events; saved with the game (state.logbook). The laptop's fleet
// and messages apps read it. At the start of each day it sends a `dailyReport` event with the
// day before, and every seven days a `weeklyReport` with the week's totals.
import { getDate, withArticle } from '../core/index.js';

const MAX_MESSAGES = 80;
const MAX_DAYS = 30;
const WEEK = 7;
const round2 = (n) => Math.round(n * 100) / 100;
// (money movements that aren't trading: borrowing and paying back)
const NOT_TRADE = new Set(['loan', 'loanPayment', 'loanRepaid', 'dev']);
// (buying and selling machines, upgrades and buildings is investment, not the day's trading)
const isCapital = (reason) => reason === 'landPurchase' || reason === 'machine' || reason === 'mod' || reason === 'stockpileUpgrade' || reason === 'plantUpgrade' || reason === 'machineSale' || reason?.startsWith('building:');

export function logbook(ctx) {
  ctx.state.logbook ??= { machines: {}, days: [], messages: [], read: 0 };
  return ctx.state.logbook;
}

// Messages you haven't opened yet (the Messages app marks them read).
export function unreadMessages(ctx) {
  const lb = logbook(ctx);
  return Math.max(0, lb.messages.length - (lb.read ?? 0));
}
export function markMessagesRead(ctx) {
  const lb = logbook(ctx);
  lb.read = lb.messages.length;
}

export function machineLog(ctx, id) {
  const lb = logbook(ctx);
  lb.machines[id] ??= { tonnesDug: 0, loads: 0, tonnesDelivered: 0, earned: 0, breakdowns: 0, services: 0, repairs: 0 };
  return lb.machines[id];
}

// The depot prices that moved most over the last day (hourly history), biggest first.
function priceMovers(ctx) {
  const out = [];
  for (const [id, p] of Object.entries(ctx.state.market?.products ?? {})) {
    const h = p.history ?? [];
    if (h.length < 2) continue;
    const from = h[Math.max(0, h.length - 25)];
    const to = h[h.length - 1];
    if (from > 0) out.push({ id, change: Math.round(((to - from) / from) * 1000) / 1000 });
  }
  return out.filter((m) => Math.abs(m.change) >= 0.01).sort((a, b) => Math.abs(b.change) - Math.abs(a.change)).slice(0, 3);
}

function trim(lb) {
  const extra = lb.messages.length - MAX_MESSAGES;
  if (extra <= 0) return;
  lb.messages.splice(0, extra);
  lb.read = Math.max(0, (lb.read ?? 0) - extra);
}

// Where the week started: the day, the bank balance and what each machine had earned.
function weekStart(ctx, day) {
  const lb = logbook(ctx);
  const earned = Object.fromEntries(Object.entries(lb.machines).map(([id, m]) => [id, m.earned]));
  lb.week = { startDay: day, money: round2(ctx.state.money), earned };
  return lb.week;
}

function weeklyReport(ctx, lb, day) {
  const w = lb.week;
  const days = lb.days.filter((d) => d.day >= w.startDay && d.day < day);
  const sum = (k) => round2(days.reduce((t, d) => t + (d[k] ?? 0), 0));
  const best = days.map((d) => ({ day: d.day, profit: round2(d.income - d.spending) })).sort((a, b) => b.profit - a.profit)[0] ?? null;
  const top = Object.entries(lb.machines)
    .map(([id, m]) => ({ id, earned: round2(m.earned - (w.earned[id] ?? 0)) }))
    .filter((m) => m.earned > 0)
    .sort((a, b) => b.earned - a.earned)[0] ?? null;
  const income = sum('income');
  const spending = sum('spending');
  return {
    week: Math.floor((w.startDay - 1) / WEEK) + 1,
    fromDay: w.startDay,
    toDay: day - 1,
    income,
    spending,
    profit: round2(income - spending),
    invested: sum('invested'),
    loads: sum('loads'),
    tonnesSold: sum('tonnesSold'),
    tonnesDug: sum('tonnesDug'),
    jobsDone: sum('jobsDone'),
    bestDay: best && best.profit > 0 ? best : null,
    topMachine: top,
    moneyFrom: w.money,
    moneyTo: round2(ctx.state.money),
  };
}

function today(ctx) {
  const lb = logbook(ctx);
  const { day } = getDate(ctx.state, ctx.data);
  if (!lb.week) weekStart(ctx, day);
  let d = lb.days[lb.days.length - 1];
  if (!d || d.day !== day) {
    d = { day, income: 0, spending: 0, invested: 0, tonnesSold: 0, tonnesDug: 0, loads: 0, jobsDone: 0 };
    lb.days.push(d);
    if (lb.days.length > MAX_DAYS) lb.days.splice(0, lb.days.length - MAX_DAYS);
  }
  return d;
}

export function logbookOnEvent(ctx, type, e) {
  switch (type) {
    case 'blastFired': {
      const d=today(ctx);d.blasts=(d.blasts??0)+1;d.rockLoosened=round2((d.rockLoosened??0)+e.tonnes);break;
    }
    case 'productionCompleted': {
      const d = today(ctx);
      d.processed = round2((d.processed ?? 0) + e.tonnes);
      d.productionBatches = (d.productionBatches ?? 0) + 1;
      break;
    }
    case 'rockDug': {
      machineLog(ctx, e.machineId).tonnesDug = round2(machineLog(ctx, e.machineId).tonnesDug + e.tonnes);
      today(ctx).tonnesDug = round2(today(ctx).tonnesDug + e.tonnes);
      break;
    }
    case 'productSold': {
      const m = machineLog(ctx, e.machineId);
      m.loads += 1;
      m.tonnesDelivered = round2(m.tonnesDelivered + e.tonnes);
      m.earned = round2(m.earned + e.revenue);
      const d = today(ctx);
      d.loads += 1;
      d.tonnesSold = round2(d.tonnesSold + e.tonnes);
      break;
    }
    case 'machineBrokeDown':
      machineLog(ctx, e.machineId).breakdowns += 1;
      break;
    case 'jobCompleted':
      if (e.type === 'service') machineLog(ctx, e.machineId).services += 1;
      if (e.type === 'repair') machineLog(ctx, e.machineId).repairs += 1;
      break;
    case 'moneyChanged': {
      if (NOT_TRADE.has(e.reason)) break;
      const d = today(ctx);
      if (isCapital(e.reason)) {
        d.invested = round2((d.invested ?? 0) - e.amount);
        break;
      }
      if (e.amount > 0) d.income = round2(d.income + e.amount);
      else d.spending = round2(d.spending - e.amount);
      break;
    }
    case 'mentorMessage': {
      const lb = logbook(ctx);
      const { day, hour, minute } = getDate(ctx.state, ctx.data);
      lb.messages.push({ day, hour, minute, from: e.from, text: e.text, kind: e.kind });
      trim(lb);
      break;
    }
    case 'inspectionAnnounced':
    case 'inspection':
    case 'rushOrder':
    case 'dealerOffer': {
      const lb = logbook(ctx);
      const { day, hour, minute } = getDate(ctx.state, ctx.data);
      const h = ctx.data.happenings;
      const what = (m) => ctx.data.materials[m]?.name.toLowerCase() ?? m;
      const machine = (t, tier) => `${ctx.data.machines.tiers[tier]?.name ?? tier} ${ctx.data.machines.types[t]?.name ?? t}`;
      const n = (k) => (k === 1 ? 'one machine' : `${k} machines`);
      let msg = null;
      if (type === 'inspectionAnnounced') {
        msg = { from: h.inspector.name, kind: 'news', text: `I'll be visiting your site on day ${e.day} at ${String(e.hour).padStart(2, '0')}:00. Any machine that's broken down or under ${h.inspector.badCondition}% is a $${e.finePerMachine} fine. As things stand that's ${e.poor.length ? n(e.poor.length) : 'none of them'}.` };
      } else if (type === 'inspection') {
        msg = e.fine > 0
          ? { from: h.inspector.name, kind: 'bad', text: `Inspection done. I found ${n(e.poor.length)} not fit to work, so there's a fine of $${e.fine}. Keep them serviced.` }
          : { from: h.inspector.name, kind: 'good', text: e.good ? 'Inspection done: everything in good order. I\'ll mention it to the people who ask about local suppliers.' : 'Inspection done: nothing to fine you for. Some of them could do with a service, mind.' };
      } else if (type === 'rushOrder') {
        msg = { from: e.client, kind: 'news', text: `Rush job, if you can: ${e.tonnes} t of clean ${what(e.material)} by ${e.days > 1 ? 'tomorrow' : 'tonight'}. There's a $${e.bonus} bonus in it. It's on your jobs board today only.` };
      } else {
        msg = { from: h.dealerOffer.name, kind: 'news', text: `This week only: the ${machine(e.type, e.tier)} for $${e.offerPrice.toLocaleString('en-US')} instead of $${e.price.toLocaleString('en-US')}. The offer ends on day ${e.until}.` };
      }
      lb.messages.push({ day, hour, minute, ...msg });
      trim(lb);
      break;
    }
    case 'milestoneReached': {
      const lb = logbook(ctx);
      const { day, hour, minute } = getDate(ctx.state, ctx.data);
      const perk = e.perk ? ctx.data.milestones?.perks?.[e.perk] : null;
      const text = `Milestone reached: ${e.title}.${e.reward ? ` $${e.reward} paid in.` : ''}${perk ? ` New perk, ${perk.name}: ${perk.text}` : ''}`;
      lb.messages.push({ day, hour, minute, from: 'Office', text, kind: 'good' });
      trim(lb);
      break;
    }
    case 'staffSlotOpened':
    case 'staffTookJob':
    case 'staffLeft': {
      const lb = logbook(ctx);
      const { day, hour, minute } = getDate(ctx.state, ctx.data);
      const mat = (m) => ctx.data.materials[m]?.name.toLowerCase() ?? m;
      const msg = {
        staffSlotOpened: () => ({ from: 'Ray', kind: 'good', text: e.slots === 1
          ? 'You\'ve enough work on to take someone on. Have a look at who\'s applying (laptop: Staff). A good operator on the digger and a driver on the truck, and the quarry works while you\'re busy elsewhere.'
          : 'The business can carry another wage now. There\'s a new post open (laptop: Staff).' }),
        staffTookJob: () => ({ from: 'Office', kind: 'tip', text: `I've taken on a job for ${e.client}: ${e.tonnes} t of clean ${mat(e.material)}, $${e.bonus} bonus. It's on the jobs board.` }),
        staffLeft: () => ({ from: 'Office', kind: 'tip', text: `${e.name} has left, with $${Math.round(e.pay)} notice pay.` }),
      }[type]();
      lb.messages.push({ day, hour, minute, ...msg });
      trim(lb);
      break;
    }
    case 'listingNotAsDescribed': {
      const lb = logbook(ctx);
      const { day, hour, minute } = getDate(ctx.state, ctx.data);
      const m = ctx.state.machines.find((x) => x.id === e.machineId);
      const name = m ? `${ctx.data.machines.tiers[m.tier]?.name ?? m.tier} ${ctx.data.machines.types[m.type]?.name ?? m.type}` : 'machine';
      lb.messages.push({ day, hour, minute, from: 'Ray', kind: 'bad', text: `That ${name.toLowerCase()} from ${e.seller} isn't what the advert said: it's more like ${e.actual}%, not ${e.claimed}%. Sold as seen, I'm afraid. Next time, have it looked over first.` });
      trim(lb);
      break;
    }
    case 'hireEnquiry':
    case 'machineReturned': {
      const lb = logbook(ctx);
      const { day, hour, minute } = getDate(ctx.state, ctx.data);
      const text = type === 'hireEnquiry'
        ? `Have you ${withArticle(e.typeName.toLowerCase())} we could hire? ${e.days} days at $${e.rate} a day ($${e.total}), paid when it comes back. (laptop: Fleet)`
        : `Your ${e.name} is back with you. Thanks: $${e.total} for the hire. It's done some work, so it'll want a look over.`;
      lb.messages.push({ day, hour, minute, from: e.client, text, kind: type === 'hireEnquiry' ? 'tip' : 'good' });
      trim(lb);
      break;
    }
    case 'creditRatingChanged': {
      const lb = logbook(ctx);
      const { day, hour, minute } = getDate(ctx.state, ctx.data);
      const order = ctx.data.economy.bank.credit.bands.map(([, name]) => name); // (best first)
      const up = order.indexOf(e.to) < order.indexOf(e.from);
      const text = up
        ? `Your credit rating is now ${e.to}. You can borrow more, and new loans come cheaper.`
        : `Your credit rating has fallen to ${e.to}. Starting the day overdrawn costs you: you can borrow less, and new loans cost more.`;
      lb.messages.push({ day, hour, minute, from: ctx.data.economy.bank.name, text, kind: up ? 'good' : 'bad' });
      trim(lb);
      break;
    }
    case 'standingOffer':
    case 'standingWeekDone':
    case 'standingWeekMissed':
    case 'standingEnded': {
      const lb = logbook(ctx);
      const { day, hour, minute } = getDate(ctx.state, ctx.data);
      const what = ctx.data.materials[e.material]?.name.toLowerCase() ?? e.material;
      const text = {
        standingOffer: () => `We'd like a regular supply: ${e.tonnesPerWeek} t of clean ${what} every week for ${e.weeks} weeks, with $${e.weeklyBonus} on top each week you deliver. Interested? (laptop: Jobs board)`,
        standingWeekDone: () => `This week's ${what} is all in, thanks. $${e.bonus} on its way (week ${e.week} of ${e.weeks}).`,
        standingWeekMissed: () => `We were short of ${what} this week (${e.delivered} of ${e.tonnes} t). Please don't let it happen again.`,
        standingEnded: () => `That's the end of our order: ${e.weeksDone} of ${e.weeks} weeks delivered in full. Thanks for the business.`,
      }[type]();
      lb.messages.push({ day, hour, minute, from: e.client, text, kind: type === 'standingWeekMissed' ? 'bad' : type === 'standingOffer' ? 'tip' : 'good' });
      trim(lb);
      if (type === 'standingWeekDone') {
        const d = today(ctx);
        d.jobsDone = (d.jobsDone ?? 0) + 1;
      }
      break;
    }
    case 'contractCompleted':
    case 'contractFailed': {
      const lb = logbook(ctx);
      const { day, hour, minute } = getDate(ctx.state, ctx.data);
      const what = ctx.data.materials[e.material]?.name.toLowerCase() ?? e.material;
      const text = type === 'contractCompleted'
        ? `That's the last of the ${what}, thanks. Your bonus of $${e.bonus} is on its way.`
        : `We couldn't wait any longer for the rest of the ${what}, so we've gone elsewhere. Maybe next time.`;
      lb.messages.push({ day, hour, minute, from: e.client, text, kind: type === 'contractCompleted' ? 'good' : 'bad' });
      trim(lb);
      if (type === 'contractCompleted') {
        const d = today(ctx);
        d.jobsDone = (d.jobsDone ?? 0) + 1;
      }
      break;
    }
    case 'marketNews': {
      const lb = logbook(ctx);
      const { day, hour, minute } = getDate(ctx.state, ctx.data);
      const what = ctx.data.materials[e.product]?.name ?? e.product;
      const pct = `${e.change > 0 ? 'up' : 'down'} ${Math.round(Math.abs(e.change) * 100)}%`;
      lb.messages.push({ day, hour, minute, from: e.source, kind: 'news', text: `${e.headline} (${what} ${pct} at the depot for ${e.days} days.)` });
      trim(lb);
      break;
    }
        case 'overheadsCharged': {
      const lb = logbook(ctx);
      const { day, hour, minute } = getDate(ctx.state, ctx.data);
      const cover = ctx.data.economy.insurance.covers?.[ctx.state.insurance?.cover]?.name ?? 'Basic';
      lb.messages.push({ day, hour, minute, from: 'Office', kind: 'tip', text: `This week's machine insurance (${cover.toLowerCase()} cover): $${e.amount.toFixed(2)} for ${e.machines} machine${e.machines === 1 ? '' : 's'}. Change the cover in Fleet; selling machines you don't use brings it down.` });
      trim(lb);
      break;
    }
    case 'dayStarted': {
      const lb = logbook(ctx);
      const { day } = getDate(ctx.state, ctx.data);
      const { hour, minute } = getDate(ctx.state, ctx.data);
      const prev = lb.days.find((d) => d.day === day - 1);
      if (prev) {
        const report = { ...prev, profit: round2(prev.income - prev.spending), movers: priceMovers(ctx) };
        lb.messages.push({ day, hour, minute, from: 'Office', kind: 'report', report });
        ctx.events.emit('dailyReport', report);
      }
      if (lb.week && day - lb.week.startDay >= WEEK) {
        const report = weeklyReport(ctx, lb, day);
        lb.messages.push({ day, hour, minute, from: 'Office', kind: 'week', report });
        ctx.events.emit('weeklyReport', report);
        weekStart(ctx, day);
      }
      trim(lb);
      break;
    }
    default:
  }
}
