import { describe, expect, it } from 'vitest';
import { ago, cleanLabel, duration, isLabId, randomId, sameOriginPath } from '../util.js';
import { DAY, HOUR, MIN, T0 } from './helpers.js';

describe('time phrases', () => {
  it.each([
    [10_000, 'just now'],
    [MIN, '1 minute ago'],
    [59 * MIN, '59 minutes ago'],
    [60 * MIN, '1 hour ago'],
    [90 * MIN, '2 hours ago'],
    [23 * HOUR, '23 hours ago'],
    [24 * HOUR, '1 day ago'],
    [13 * DAY, '13 days ago'],
  ])('%i ms ago reads "%s"', (d, want) => expect(ago(T0 - d, T0)).toBe(want));

  it('switches to a date after two weeks, and never reads the future as negative', () => {
    expect(ago(T0 - 20 * DAY, T0)).toMatch(/^on \d{1,2} [A-Z][a-z]{2}$/);
    expect(ago(T0 + HOUR, T0)).toBe('just now');
  });

  it.each([[40_000, '40 s'], [14 * MIN, '14 min'], [65 * MIN, '1 h 05 min']])('duration %i ms is %s', (ms, want) =>
    expect(duration(ms)).toBe(want));
});

describe('validation', () => {
  it('lab ids are lowercase, digits and dashes', () => {
    expect(['hub', 'black-hole', 'token-ekg', 'claude-prep'].every(isLabId)).toBe(true);
    expect(['', 'Hub', 'a b', '-x', 'x'.repeat(65), 42].some(isLabId)).toBe(false);
  });

  it('a same-origin path or nothing', () => {
    const base = 'https://luisblanco.dev/labs/claude-prep/';
    expect(sameOriginPath('#/mock/3', base)).toBe('/labs/claude-prep/#/mock/3');
    expect(sameOriginPath('../heptapod.html?a=1', base)).toBe('/labs/heptapod.html?a=1');
    expect(sameOriginPath('//evil.example/x', base)).toBeNull();
    expect(sameOriginPath('data:text/html,x', base)).toBeNull();
  });

  it('labels are one trimmed line, capped', () => {
    expect(cleanLabel('  a \n b  ')).toBe('a b');
    expect(cleanLabel('x'.repeat(100), 10)).toBe('xxxxxxxxx…');
    expect(cleanLabel(42)).toBe('');
  });

  it('random ids do not repeat', () => {
    expect(new Set(Array.from({ length: 200 }, randomId)).size).toBe(200);
  });
});
