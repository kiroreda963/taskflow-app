import { describe, expect, it } from 'vitest';

import { dueState, formatClock, formatMinutes, todayString } from './utils.js';

describe('formatClock', () => {
  it('formats minutes and seconds', () => expect(formatClock(125)).toBe('2:05'));
  it('formats hours', () => expect(formatClock(3725)).toBe('1:02:05'));
  it('clamps negatives', () => expect(formatClock(-5)).toBe('0:00'));
});

describe('formatMinutes', () => {
  it('formats minutes only', () => expect(formatMinutes(40)).toBe('40m'));
  it('formats hours and minutes', () => expect(formatMinutes(95)).toBe('1h 35m'));
  it('drops zero minutes', () => expect(formatMinutes(120)).toBe('2h'));
});

describe('dueState', () => {
  it('classifies dates', () => {
    expect(dueState('2026-10-10', '2026-10-17')).toBe('overdue');
    expect(dueState('2026-10-17', '2026-10-17')).toBe('today');
    expect(dueState('2026-10-20', '2026-10-17')).toBe('upcoming');
    expect(dueState(null, '2026-10-17')).toBeNull();
  });
});

describe('todayString', () => {
  it('returns YYYY-MM-DD', () => expect(todayString()).toMatch(/^\d{4}-\d{2}-\d{2}$/));
});
