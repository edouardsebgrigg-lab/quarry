// The yard's logbook: what each machine has done, a summary of each day, and every message
// Ray has sent. Built from game events; saved with the game (state.logbook). The laptop's fleet
// and messages apps read it. At the start of each day it sends a `dailyReport` event with the
// day before.
import { getDate } from '../core/index.js';

const MAX_MESSAGES = 80;
const MAX_DAYS = 30;
const round2 = (n) => Math.round(n * 100) / 100;
// (money movements that aren't trading: borrowing and paying back)
const NOT_TRADE = new Set(['loan', 'loanPayment', 'loanRepaid', 'dev']);

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

function trim(lb) {
  const extra = lb.messages.length - MAX_MESSAGES;
  if (extra <= 0) return;
  lb.messages.splice(0, extra);
  lb.read = Math.max(0, (lb.read ?? 0) - extra);
}

function today(ctx) {
  const lb = logbook(ctx);
  const { day } = getDate(ctx.state, ctx.data);
  let d = lb.days[lb.days.length - 1];
  if (!d || d.day !== day) {
    d = { day, income: 0, spending: 0, tonnesSold: 0, tonnesDug: 0, loads: 0 };
    lb.days.push(d);
    if (lb.days.length > MAX_DAYS) lb.days.splice(0, lb.days.length - MAX_DAYS);
  }
  return d;
}

export function logbookOnEvent(ctx, type, e) {
  switch (type) {
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
      break;
    }
    case 'overheadsCharged': {
      const lb = logbook(ctx);
      const { day, hour, minute } = getDate(ctx.state, ctx.data);
      lb.messages.push({ day, hour, minute, from: 'Office', kind: 'tip', text: `This week's machine insurance: $${e.amount.toFixed(2)} for ${e.machines} machine${e.machines === 1 ? '' : 's'}. It's taken each week; selling machines you don't use brings it down.` });
      trim(lb);
      break;
    }
    case 'dayStarted': {
      const lb = logbook(ctx);
      const { day } = getDate(ctx.state, ctx.data);
      const prev = lb.days.find((d) => d.day === day - 1);
      if (!prev) break;
      const report = { ...prev, profit: round2(prev.income - prev.spending) };
      const { hour, minute } = getDate(ctx.state, ctx.data);
      lb.messages.push({ day, hour, minute, from: 'Office', kind: 'report', report });
      trim(lb);
      ctx.events.emit('dailyReport', report);
      break;
    }
    default:
  }
}
