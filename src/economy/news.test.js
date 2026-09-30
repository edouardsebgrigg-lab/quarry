import { describe, it, expect } from 'vitest';
import { createGame } from '../game/index.js';
import { loadData } from '../core/index.js';
import { newsState, newsMultiplier, activeNews } from './news.js';
import { currentPrice } from './market.js';

describe('market news', () => {
  it('breaks stories that move one material’s price for a few days, then end', () => {
    const game = createGame({ seed: 11 });
    const broke = [];
    const ended = [];
    game.events.on('marketNews', (e) => broke.push(e));
    game.events.on('marketNewsEnded', (e) => ended.push(e));
    expect(newsMultiplier(game.ctx, 'gravel')).toBe(1);
    const cfg = game.data.market.news;
    for (let d = 0; d < 40; d++) {
      game.dev.skipDays(1);
      const active = newsState(game.ctx).active;
      expect(active.length).toBeLessThanOrEqual(cfg.maxActive);
      expect(new Set(active.map((a) => a.product)).size).toBe(active.length); // one story per material
      for (const a of activeNews(game.ctx)) expect(a.daysLeft).toBeGreaterThan(0);
    }
    expect(broke.length).toBeGreaterThan(3);
    expect(ended.length).toBeGreaterThan(0);
    const story = broke[0];
    expect(story.headline).toBeTruthy();
    expect(story.days).toBeGreaterThanOrEqual(2);
  });

  it('multiplies the depot price while a story runs', () => {
    const game = createGame({ seed: 3 });
    const before = currentPrice(game.ctx, 'clay');
    newsState(game.ctx).active.push({ id: 'pondLining', product: 'clay', change: 0.25, from: 1, until: 3 });
    expect(newsMultiplier(game.ctx, 'clay')).toBeCloseTo(1.25);
    expect(currentPrice(game.ctx, 'clay')).toBeCloseTo(before * 1.25);
    expect(newsMultiplier(game.ctx, 'sand')).toBe(1);
  });

  it('uses its own random numbers: the market’s swings are the same with or without news', () => {
    const quiet = loadData();
    quiet.market = { ...quiet.market, news: undefined };
    const a = createGame({ seed: 21 });
    const b = createGame({ seed: 21, data: quiet });
    a.dev.skipDays(6);
    b.dev.skipDays(6);
    expect(a.state.market.products.sand.trend).toBe(b.state.market.products.sand.trend);
    expect(newsState(b.ctx).active).toHaveLength(0);
  });
});
