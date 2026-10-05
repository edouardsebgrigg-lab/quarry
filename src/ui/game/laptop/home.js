// The laptop's home screen: your balance, the goal you're on, the best price at the depot today,
// and how the fleet is doing, with shortcuts into the apps.
import { el, setText } from '../../dom.js';
import { money, price, tonnes } from '../../format.js';
import { getDate, withArticle } from '../../../core/index.js';
import { currentPrice, activeNews } from '../../../economy/index.js';
import { machinesAt, machinePrice } from '../../../machinery/index.js';
import { lineIcon } from './icons.js';
import { forecast } from '../../../weather/index.js';
import { nextInspection, inspectionReport, dealerOffer } from '../../../happenings/index.js';
import { contractsState } from '../../../contracts/index.js';
import { hireState } from '../../../hire/index.js';
import { staffState, openSlots } from '../../../staff/index.js';
import { productionQueue, productionQueueStatus } from '../../../production/index.js';
import { milestones, pinnedMilestone } from '../../../career/index.js';

const targetAmount = (metric, value) => ['tonnesSold', 'tonnesDug', 'cleanTonnes', 'gravelDug', 'processedTonnes'].includes(metric) ? tonnes(value)
  : ['bestDay', 'totalEarned'].includes(metric) ? money(value) : metric === 'roadMetres' ? `${Math.round(value)} m` : String(Math.floor(value));

export function homeApp({ game, openApp, setHead }) {
  const { data } = game;
  const ctx = game.ctx;
  const hour = getDate(game.state, data).hour;
  setHead(hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening', 'Here’s how the quarry is doing');

  const tile = (label, value, note, action) => {
    const v = el('div', { class: 'lt-stat-value' });
    const n = el('div', { class: 'lt-stat-note' });
    const node = el(action ? 'button' : 'div', { class: `lt-stat ${action ? 'link' : ''}`, onClick: action },
      el('div', { class: 'lt-stat-label' }, label), v, n);
    return { node, set(val, note2) { setText(v, val); setText(n, note2 ?? ''); } };
  };
  const bal = tile('Balance');
  const best = tile('Best price today', null, null, () => openApp('prices'));
  const fleet = tile('Your machines', null, null, () => openApp('fleet'));
  const weather = tile('Weather');
  const goalTitle = el('div', { class: 'lt-goal-title' });
  const goalText = el('div', { class: 'lt-goal-text' });
  const goalLabel = el('div', { class: 'lt-card-label' });
  const targetProgress = el('div', { class: 'lt-target-progress' });
  const targetBenefit = el('div', { class: 'lt-target-benefit' });
  const targetFill = el('i');
  const targetTrack = el('div', { class: 'lt-ms-bar' }, targetFill);
  const chooseTarget = el('button', { class: 'lt-link', onClick: () => openApp('milestones') });
  const clearTarget = el('button', { class: 'lt-link', onClick: () => { game.actions.unpinMilestone(); refresh(); } }, 'Clear target');
  const goalCard = el('div', { class: 'lt-card lt-goal' }, goalLabel, goalTitle, goalText, targetProgress, targetTrack, targetBenefit,
    el('div', { class: 'lt-target-actions' }, chooseTarget, clearTarget));
  // The latest story moving a price, as a one-line ticker into the prices app.
  const newsLine = el('button', { class: 'lt-ticker', onClick: () => openApp('prices') });
  // Coming up: the inspector, the dealer's offer, a regular customer, a rush job, the closest
  // milestone.
  const upcoming = el('div', { class: 'lt-rows' });
  const upcomingCard = el('div', { class: 'lt-card lt-upcoming' }, el('div', { class: 'lt-card-label' }, 'Coming up'), upcoming);
  let upcomingKey = '';
  function comingUp() {
    const rows = [];
    for(const [id,plant] of Object.entries(data.production.plants)) {
      const q=productionQueue(ctx,id),status=productionQueueStatus(ctx,id);
      if(q.entries.length&&['waiting','paused'].includes(status.state))rows.push({kind:'warn',title:`${plant.name}: ${q.entries.reduce((t,e)=>t+e.remaining,0)} batches waiting`,sub:status.reason,app:'operations'});
    }
    const visit = nextInspection(ctx);
    if (visit?.announced) {
      const r = inspectionReport(ctx);
      rows.push({ kind: r.fine ? 'warn' : 'ok', title: `Site inspection, day ${visit.day} at ${visit.hour}:00`,
        sub: r.fine ? `As things stand: ${r.poor.length} machine${r.poor.length > 1 ? 's' : ''} broken or under ${data.happenings.inspector.badCondition}%, a ${money(r.fine)} fine. Service them first.` : r.good ? 'Everything in good order: a clean bill would lift your reputation.' : 'Nothing to fine as things stand.',
        app: 'fleet' });
    }
    const offer = dealerOffer(ctx);
    if (offer) {
      const name = `${data.machines.tiers[offer.tier]?.name ?? offer.tier} ${data.machines.types[offer.type]?.name ?? offer.type}`;
      rows.push({ kind: 'good', title: `Ashby Plant: ${name} for ${money(machinePrice(ctx, offer.type, offer.tier))}`, sub: `${Math.round(offer.discount * 100)}% off until day ${offer.until}`, app: 'dealer' });
    }
    // A regular customer: an offer waiting, or this week's quota until it's met.
    const st = contractsState(ctx).standing ?? {};
    const mat = (m) => (data.materials[m]?.name ?? m).toLowerCase();
    if (st.offer) {
      rows.push({ kind: 'good', title: `${st.offer.client} wants a regular supply: +${money(st.offer.weeklyBonus)} a week`, sub: `${st.offer.tonnesPerWeek} t of clean ${mat(st.offer.material)} every week for ${st.offer.weeks} weeks; answer by day ${st.offer.expires}`, app: 'jobs' });
    } else if (st.active && !st.active.paidThisWeek) {
      const a = st.active;
      const left = a.weekEnd - getDate(game.state, data).day;
      rows.push({ kind: left <= 1 ? 'warn' : '', title: `Weekly order for ${a.client}: ${a.delivered} of ${a.tonnesPerWeek} t`, sub: `Clean ${mat(a.material)}, week ${a.week} of ${a.weeks}, ${left <= 0 ? 'ends today' : `ends day ${a.weekEnd}`}`, app: 'jobs' });
    }
    const posts = openSlots(ctx) - staffState(ctx).workers.length;
    if (posts > 0) rows.push({ kind: 'good', title: posts > 1 ? `${posts} posts open: take someone on` : 'A post is open: take someone on', sub: 'Operators, drivers, an office hand or a fitter: see who’s applying', app: 'staff' });
    const ask = hireState(ctx).enquiry;
    if (ask) rows.push({ kind: 'good', title: `${ask.client} wants to hire ${withArticle((data.machines.types[ask.type]?.name ?? ask.type).toLowerCase())}: +${money(ask.total)}`, sub: `${ask.days} days at ${money(ask.rate)} a day; answer by day ${ask.expires}`, app: 'fleet' });
    const rush = contractsState(ctx).offers.find((o) => o.rush);
    if (rush) rows.push({ kind: 'good', title: `Rush job for ${rush.client}: +${money(rush.bonus)}`, sub: `${rush.tonnes} t of clean ${(data.materials[rush.material]?.name ?? rush.material).toLowerCase()}, take it today`, app: 'jobs' });
    const next = milestones(ctx).filter((m) => !m.reached).sort((a, b) => b.progress - a.progress)[0];
    if (next && !pinnedMilestone(ctx)) rows.push({ kind: '', title: `Closest milestone: ${next.title} (${Math.floor(next.progress * 100)}%)`, sub: `${next.text} +${money(next.reward)}`, app: 'milestones' });
    const key = JSON.stringify(rows);
    if (key === upcomingKey) return;
    upcomingKey = key;
    upcoming.replaceChildren(...rows.map((r) => el('button', { class: `lt-row lt-up ${r.kind}`, onClick: () => openApp(r.app) },
      el('div', { class: 'lt-row-main' }, el('b', {}, r.title), el('span', {}, r.sub)), lineIcon('back', 'lt-up-go'))));
    upcomingCard.style.display = rows.length ? '' : 'none';
  }

  function refresh() {
    bal.set(money(game.state.money), game.state.money < 0 ? 'Overdrawn: the bank charges interest every day' : 'Ready to spend');
    let top = null;
    for (const id of Object.keys(data.depot.bays)) {
      if (id === data.depot.mixedProduct) continue;
      const p = currentPrice(ctx, id);
      if (!top || p > top.p) top = { id, p };
    }
    best.set(top ? `${price(top.p)}/t` : '—', top ? `${data.depot.bays[top.id].name}, clean` : '');
    const ms = machinesAt(ctx, game.state.currentSiteId);
    const tired = ms.filter((m) => m.broken || m.condition < 50).length;
    fleet.set(String(ms.length), tired ? `${tired} need${tired === 1 ? 's' : ''} a service or repair` : 'All in good order');
    const f = forecast(ctx);
    weather.set(f.today.name, `Tomorrow: ${f.tomorrow.name.toLowerCase()}${f.tomorrow.rain > 0 ? ' (slippery on the ramps)' : ''}`);
    const story = activeNews(ctx).sort((a, b) => b.from - a.from)[0];
    newsLine.style.display = story ? '' : 'none';
    if (story) {
      const up = story.change > 0;
      const text = `${data.materials[story.product]?.name ?? story.product} ${up ? '▲' : '▼'} ${Math.round(Math.abs(story.change) * 100)}%`;
      if (newsLine.dataset.key !== story.id) {
        newsLine.dataset.key = story.id;
        newsLine.replaceChildren(el('span', { class: 'lt-ticker-src' }, story.source), el('span', { class: 'lt-ticker-text' }, story.headline),
          el('b', { class: up ? 'up' : 'down' }, text));
      }
    }
    const step = data.objectives.steps[game.state.objectives.index];
    const target = pinnedMilestone(ctx);
    goalCard.classList.toggle('personal-target', !!target);
    setText(goalLabel, target ? target.reached ? 'Personal target reached' : 'Your personal target' : 'Current goal');
    setText(goalTitle, target ? target.title : step ? step.title : 'All goals done');
    setText(goalText, target ? `${target.text} ${target.nextStep}` : step ? step.text : 'You’ve worked through every goal. Choose a personal target and keep growing the quarry.');
    for (const node of [targetProgress, targetTrack, targetBenefit, clearTarget]) node.style.display = target ? '' : 'none';
    setText(chooseTarget, target ? 'Switch target' : 'Choose a personal target');
    if (target) {
      setText(targetProgress, target.reached ? `Reached on day ${target.day}` : `${targetAmount(target.metric, target.value)} of ${targetAmount(target.metric, target.target)} · ${Math.floor(target.progress * 100)}%`);
      targetFill.style.width = `${Math.round(target.progress * 100)}%`;
      setText(targetBenefit, `${target.reached ? 'Earned' : 'Reward'}: ${money(target.reward ?? 0)}${target.perkName ? ` · ${target.perkName}: ${target.perkText}` : ''}`);
    }
    comingUp();
  }
  refresh();

  const shortcut = (icon, label, sub, id) => el('button', { class: 'lt-shortcut', onClick: () => openApp(id) },
    lineIcon(icon), el('div', {}, el('b', {}, label), el('span', {}, sub)));

  const node = el('div', { class: 'lt-home' },
    el('div', { class: 'lt-stats four' }, bal.node, best.node, fleet.node, weather.node),
    newsLine,
    goalCard,
    upcomingCard,
    el('div', { class: 'lt-shortcuts' },
      shortcut('book', 'Field guide', 'Your journey, practical help and controls', 'guide'),
      shortcut('building', 'Quarry operations', 'Work areas, stockpiles and production', 'operations'),
      shortcut('chart', 'Regional trade', 'New buyers, daily demand and delivery guides', 'trade'),
      shortcut('digger', 'Plant dealer', 'Machines, upgrades, yard buildings', 'dealer'),
      shortcut('chart', 'Milestones', 'Choose what to work towards next', 'milestones'),
      shortcut('chart', 'Depot prices', 'What each material sells for today', 'prices'),
      shortcut('bank', 'Bank', 'Your statement, and loans to grow faster', 'bank')));
  return { node, refresh, headSet: true };
}
