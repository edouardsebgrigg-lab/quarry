// The bank: your balance, what you can borrow, your loans, and a statement of everything in and out.
import { el, clear, setText } from '../../dom.js';
import { money, signedMoney } from '../../format.js';
import { bankState, owed, creditRating } from '../../../economy/index.js';
import { profitChart } from './profitChart.js';

const REASONS = {
  sale: 'Material delivery',
  stockpileUpgrade: 'Stockpile bay expansion', plantUpgrade: 'Processing plant upgraded',
  plantService: 'Processing plant service',
  fuel: 'Diesel',
  service: 'Machine service',
  repair: 'Repair',
  machine: 'Machine bought',
  machineSale: 'Machine sold',
  mod: 'Upgrade fitted',
  objective: 'Goal reward',
  interest: 'Overdraft interest',
  loan: 'Loan paid in',
  loanPayment: 'Loan repayment',
  loanRepaid: 'Loan paid off',
  callout: 'Mechanic call-out',
  contract: 'Job bonus',
  insurance: 'Machine insurance (weekly)',
  hire: 'Machine hire',
  inspection: 'Machine looked over',
  wages: 'Wages',
  hiringFee: 'Agency fee (new staff)',
  dev: 'Adjustment',
};
function describe(reason) {
  if(reason==='blastDrilling')return 'Rock cut: drilling crew';
  if(reason==='blastCharging')return 'Rock cut: charging crew';
  if (REASONS[reason]) return REASONS[reason];
  if (reason?.startsWith('building:')) return 'Yard building';
  if (reason?.startsWith('earthworks:')) return `Earthworks (${reason.split(':')[1]})`;
  if (reason?.startsWith('production:')) return `Material processing (${reason.split(':')[1]})`;
  return reason ?? 'Payment';
}
const pctDay = (r) => `${(r * 100).toFixed(1)}% a day`;

export function bankApp({ game, feedback, setHead }) {
  const { data } = game;
  const cfg = data.economy.bank;
  setHead(cfg.name, `Business current account · ${game.actions.companyName()}`);
  let amount = cfg.amounts[0];
  let days = cfg.terms[1] ?? cfg.terms[0];

  const balanceV = el('div', { class: 'lt-stat-value' });
  const balanceN = el('div', { class: 'lt-stat-note' });
  const owedV = el('div', { class: 'lt-stat-value' });
  const owedN = el('div', { class: 'lt-stat-note' });
  const limitV = el('div', { class: 'lt-stat-value' });
  const ratingV = el('div', { class: 'lt-stat-value' });
  const ratingN = el('div', { class: 'lt-stat-note' });
  const ratingBar = el('div', { class: 'lt-credit-bar' }, el('i'));
  const loansBox = el('div', { class: 'lt-rows' });
  const amountSeg = el('div', { class: 'lt-chips' });
  const termSeg = el('div', { class: 'lt-chips' });
  const quote = el('div', { class: 'lt-quote' });
  const takeBtn = el('button', { class: 'btn btn-primary lt-buy', onClick: take }, 'Take loan');
  const statement = el('tbody');
  let statementKey = '';
  const chart = profitChart(game);

  function take() {
    const r = game.actions.takeLoan(amount, days);
    feedback.message(r.ok ? `Loan of ${money(amount)} paid in: ${money(r.loan.payment)} a day for ${days} days` : r.reason, r.ok ? 'good' : 'warn');
    refresh(true);
  }

  function chips(box, values, current, label, set) {
    clear(box);
    for (const v of values) {
      box.append(el('button', { class: `lt-chip ${v === current ? 'active' : ''}`, onClick: () => { set(v); refresh(true); } }, label(v)));
    }
  }

  function refresh(force = false) {
    const b = bankState(game.ctx);
    chart.refresh();
    setText(balanceV, money(game.state.money));
    setText(balanceN, game.state.money < 0 ? `Overdrawn: ${pctDay(data.economy.debtInterestPerDay)} interest` : 'Available now');
    balanceV.classList.toggle('neg', game.state.money < 0);
    setText(owedV, money(owed(game.ctx)));
    setText(owedN, b.loans.length ? `${b.loans.length} loan${b.loans.length > 1 ? 's' : ''}` : 'No loans');
    setText(limitV, money(game.actions.creditLimit()));
    const cr = creditRating(game.ctx);
    setText(ratingV, cr.name);
    ratingV.dataset.band = cr.name.toLowerCase();
    ratingBar.firstChild.style.width = `${cr.score}%`;
    const rateNote = Math.abs(cr.rateFactor - 1) < 0.01 ? 'loans at the usual rate' : `loans at ${cr.rateFactor < 1 ? '' : '+'}${Math.round((cr.rateFactor - 1) * 100)}% interest`;
    setText(ratingN, `${Math.round(cr.score)}/100 · ${rateNote}`);

    const offers = game.actions.loanOffers();
    const offer = offers.find((o) => o.amount === amount && o.days === days);
    if (force || !amountSeg.childElementCount) {
      chips(amountSeg, cfg.amounts, amount, money, (v) => { amount = v; });
      chips(termSeg, cfg.terms, days, (v) => `${v} days`, (v) => { days = v; });
      clear(quote);
      quote.append(
        el('div', {}, el('span', {}, 'Each morning'), el('b', {}, money(offer.payment))),
        el('div', {}, el('span', {}, 'Total to repay'), el('b', {}, money(offer.total))),
        el('div', {}, el('span', {}, 'Interest'), el('b', {}, pctDay(offer.rate))));
      clear(loansBox);
      if (!b.loans.length) loansBox.append(el('div', { class: 'lt-muted-row' }, 'You have no loans.'));
      for (const loan of b.loans) {
        const pay = el('button', { class: 'btn', onClick: () => {
          const r = game.actions.repayLoan(loan.id);
          feedback.message(r.ok ? `Loan paid off: ${money(r.paid)}` : r.reason, r.ok ? 'good' : 'warn');
          refresh(true);
        } }, `Pay off ${money(loan.balance)}`);
        pay.disabled = game.state.money < loan.balance;
        loansBox.append(el('div', { class: 'lt-row' },
          el('div', { class: 'lt-row-main' }, el('b', {}, `${money(loan.amount)} over ${loan.days} days`),
            el('span', {}, `${money(loan.payment)} each morning · ${loan.daysLeft} day${loan.daysLeft === 1 ? '' : 's'} left · ${money(loan.balance)} to clear`)),
          pay));
      }
    }
    takeBtn.disabled = !offer.ok;
    takeBtn.title = offer.reason ?? '';
    setText(takeBtn, offer.ok ? `Borrow ${money(amount)}` : offer.reason);

    const key = `${b.statement.length}:${b.statement[b.statement.length - 1]?.amount}`;
    if (force || key !== statementKey) {
      statementKey = key;
      clear(statement);
      const rows = b.statement.slice(-60).reverse();
      if (!rows.length) statement.append(el('tr', {}, el('td', { colspan: 4, class: 'lt-muted-row' }, 'Nothing yet.')));
      for (const s of rows) {
        statement.append(el('tr', {},
          el('td', { class: 'lt-st-when' }, `Day ${s.day}, ${String(s.hour).padStart(2, '0')}:00`),
          el('td', {}, describe(s.reason), s.count > 1 ? el('span', { class: 'lt-st-count' }, ` ×${s.count}`) : null),
          el('td', { class: `lt-st-amt ${s.amount >= 0 ? 'in' : 'out'}` }, signedMoney(s.amount)),
          el('td', { class: 'lt-st-bal' }, money(s.balance))));
      }
    }
  }
  refresh(true);

  const node = el('div', { class: 'lt-bank' },
    el('div', { class: 'lt-stats four' },
      el('div', { class: 'lt-stat' }, el('div', { class: 'lt-stat-label' }, 'Balance'), balanceV, balanceN),
      el('div', { class: 'lt-stat' }, el('div', { class: 'lt-stat-label' }, 'Owed on loans'), owedV, owedN),
      el('div', { class: 'lt-stat' }, el('div', { class: 'lt-stat-label' }, 'You can borrow'), limitV,
        el('div', { class: 'lt-stat-note' }, 'Grows with what you earn, your machines and your rating')),
      el('div', { class: 'lt-stat', title: 'Rises a little each morning you’re in credit and with every loan paid off; falls each morning you start overdrawn' },
        el('div', { class: 'lt-stat-label' }, 'Credit rating'), ratingV, ratingBar, ratingN)),
    el('div', { class: 'lt-card' }, chart.node),
    el('div', { class: 'lt-bank-cols' },
      el('div', { class: 'lt-card' }, el('div', { class: 'lt-card-label' }, 'Borrow'),
        el('div', { class: 'lt-field' }, el('span', {}, 'Amount'), amountSeg),
        el('div', { class: 'lt-field' }, el('span', {}, 'Pay back over'), termSeg),
        quote, takeBtn),
      el('div', { class: 'lt-card' }, el('div', { class: 'lt-card-label' }, 'Your loans'), loansBox,
        el('p', { class: 'lt-note' }, 'Repayments come out every morning, even if that takes you overdrawn. You can pay a loan off early for what’s left, with no more interest.'))),
    el('div', { class: 'lt-card' }, el('div', { class: 'lt-card-label' }, 'Statement'),
      el('table', { class: 'lt-statement' },
        el('thead', {}, el('tr', {}, ['When', 'What', 'Amount', 'Balance'].map((h) => el('th', {}, h)))), statement)));
  return { node, refresh: () => refresh(false), headSet: true };
}
