// Top of the screen: status card (money, date, site, speed) and shortcut chips.
import { el, setText, kbd, icon } from '../dom.js';
import { money, clockTime } from '../format.js';
import { getDate } from '../../core/index.js';
import { getSiteData } from '../../quarry/index.js';
import { keyLabel } from '../../input/index.js';

export function createHud({ game, runtime, settings, onShop, onMarket, onMap, onMenu }) {
  const moneyText = el('div', { class: 'hud-money' });
  const debtTag = el('div', { class: 'hud-debt' }, 'IN DEBT');
  const dateText = el('span', { class: 'hud-date' });
  const siteText = el('span', { class: 'hud-site' });

  const speedButtons = [
    { content: icon('pause'), title: 'Pause time', onClick: () => runtime.togglePause(), isActive: () => runtime.isUserPaused() },
    ...game.data.game.speeds.map((s, i) => ({
      content: `${s}×`,
      title: `Speed ${s}×`,
      onClick: () => runtime.setSpeed(i),
      isActive: () => !runtime.isUserPaused() && !runtime.isDevFast() && runtime.speedIndex() === i,
    })),
  ].map((b) => ({ ...b, node: el('button', { title: b.title, onClick: b.onClick }, b.content) }));

  const key = (action) => kbd(keyLabel(settings.bindings[action]));
  const shortcut = (label, k, onClick) => el('button', { class: 'shortcut', onClick }, k, label);

  const node = el('div', { class: 'hud' },
    el('div', { class: 'hud-status glass' },
      el('div', { class: 'hud-money-row' }, moneyText, debtTag),
      el('div', { class: 'hud-meta' }, dateText, el('span', { class: 'sep' }, '•'), siteText),
      el('div', { class: 'hud-speed seg' }, speedButtons.map((b) => b.node))),
    el('div', { class: 'hud-shortcuts' },
      shortcut('Shop', key('shop'), onShop),
      shortcut('Market', key('market'), onMarket),
      shortcut('Map', key('map'), onMap),
      shortcut('Menu', kbd('Esc'), onMenu)),
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
