import { describe, it, expect } from 'vitest';
import { createGame } from '../game/index.js';
import { currentWeather, forecast, weatherState } from './index.js';

describe('the weather', () => {
  it('starts sunny, and changes during the morning to what was forecast', () => {
    const game = createGame({ seed: 3 });
    expect(currentWeather(game.ctx).kind).toBe('sunny');
    const changes = [];
    game.events.on('weatherChanged', (w) => changes.push(w.kind));
    for (let d = 0; d < 20; d++) {
      const expected = forecast(game.ctx).tomorrow.kind;
      game.dev.skipDays(1);
      expect(forecast(game.ctx).today.kind).toBe(expected);
      game.dev.skipHours(16); // (past the latest change hour)
      expect(currentWeather(game.ctx).kind).toBe(expected);
      game.dev.skipHours(8);
      void d;
    }
    expect(new Set(changes).size).toBeGreaterThan(1);
  });

  it('rain means less grip; every kind in the tables is defined', () => {
    const game = createGame({ seed: 3 });
    const { kinds, next } = game.data.weather;
    expect(kinds.rain.grip).toBeLessThan(kinds.sunny.grip);
    for (const [from, table] of Object.entries(next)) {
      expect(kinds[from]).toBeTruthy();
      expect(Object.values(table).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
    }
  });

  it('is saved with the game and doesn’t change the rest of the game’s luck', () => {
    const game = createGame({ seed: 3 });
    game.dev.skipDays(3);
    const saved = JSON.parse(JSON.stringify(game.snapshot()));
    const g2 = createGame({ seed: 3, state: saved });
    expect(weatherState(g2.ctx)).toEqual(weatherState(game.ctx));
    expect(g2.state.rngState).toBe(game.state.rngState);
  });
});
