// Top bar: site, money, date, speed, and menu buttons.
import { el, setText } from '../dom.js';
import { money, clockTime } from '../format.js';
import { getDate } from '../../core/index.js';
import { getSiteData } from '../../quarry/index.js';
import { keyLabel } from '../../input/index.js';

export function createHud({ game, runtime, settings, onShop, onMarket, onMenu }) {
  const moneyText = el('div', { class: 'hud-money' });
  const debtTag = el('div', { class: 'hud-debt' }, 'IN DEBT');
  const dateText = el('div', { class: 'hud-date' });
  const siteText = el('div', { class: 'hud-site' });

  const speedButtons = [
    { label: '❚❚', title: 'Pause', onClick: () => runtime.togglePause(), isActive: () => runtime.isUserPaused() },
    ...game.data.game.speeds.map((s, i) => ({
      label: `${s}×`, title: `Speed ${s}×`,
      onClick: () => runtime.setSpeed(i),
      isActive: () => !runtime.isUserPaused() && !runtime.isDevFast() && runtime.speedIndex() === i,
    })),
  ].map((b) => ({ ...b, node: el('button', { class: 'btn btn-speed', title: b.title, onClick: b.onClick }, b.label) }));

  const keyHint = (action) => el('span', { class: 'key' }, keyLabel(settings.bindings[action]));

  const node = el('div', { class: 'hud' },
    el('div', { class: 'hud-left' }, el('div', { class: 'hud-logo' }, 'QUARRY'), siteText),
    el('div', { class: 'hud-center' },
      el('div', { class: 'hud-money-wrap' }, moneyText, debtTag),
      dateText,
      el('div', { class: 'hud-speed' }, speedButtons.map((b) => b.node)),
    ),
    el('div', { class: 'hud-right' },
      el('button', { class: 'btn', onClick: onShop }, 'Shop ', keyHint('shop')),
      el('button', { class: 'btn', onClick: onMarket }, 'Market ', keyHint('market')),
      el('button', { class: 'btn', onClick: onMenu }, 'Menu ', el('span', { class: 'key' }, 'Esc')),
    ),
  );

  let shownMoney = game.state.money;

  return {
    node,
    moneyNode: moneyText,
    update(dt) {
      const target = game.state.money;
      // Count toward the real value so gains feel like they "roll in".
      shownMoney += (target - shownMoney) * Math.min(1, dt * 6);
      if (Math.abs(target - shownMoney) < 0.5) shownMoney = target;
      setText(moneyText, money(shownMoney));
      moneyText.classList.toggle('negative', target < 0);
      debtTag.style.display = target < 0 ? '' : 'none';
      setText(dateText, clockTime(getDate(game.state, game.data)));
      setText(siteText, getSiteData(game.data, game.state.currentSiteId).name);
      for (const b of speedButtons) b.node.classList.toggle('active', b.isActive());
    },
  };
}
