// Timer due-time logic shared by the app and the server.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeDue, lastAnchor, reminderText, fmtSpan } from '../public/js/timer-core.js';

const H = 3600e3, NOW = Date.parse('2026-11-05T15:00:00Z');
const timer = (data, t = NOW - 10 * H) => ({ type: 'timer', t, data: { enabled: true, ...data } });
const log = (type, hoursAgo, data = {}) => ({ type, t: NOW - hoursAgo * H, data });

test('repeating timers count from the last matching log', () => {
  const logs = [log('bottle', 2), log('breast', 1, { left: 600, right: 300, lastSide: 'R' }), log('diaper', 4, { pee: true })];
  assert.equal(computeDue(timer({ kind: 'feed', intervalMin: 180 }), logs, NOW).due, NOW + 2 * H);
  assert.equal(computeDue(timer({ kind: 'bottle', intervalMin: 180 }), logs, NOW).due, NOW + 1 * H);
  const diaper = computeDue(timer({ kind: 'diaper', intervalMin: 180 }), logs, NOW);
  assert.equal(diaper.state, 'due');
  assert.equal(diaper.due, NOW - 1 * H);
});

test('no logs yet → counts from when the timer was set', () => {
  const r = computeDue(timer({ kind: 'pump', intervalMin: 120 }, NOW - H), [], NOW);
  assert.equal(r.state, 'waiting'); assert.equal(r.due, NOW + H); assert.equal(r.fromLog, false);
});

test('feeding or sleeping right now pauses the timer', () => {
  const running = [log('breast', 0.2, { running: true, side: 'L', acc: { L: 0, R: 0 } })];
  assert.equal(computeDue(timer({ kind: 'feed', intervalMin: 180 }), running, NOW).state, 'active');
  assert.notEqual(computeDue(timer({ kind: 'bottle', intervalMin: 180 }), running, NOW).state, 'active'); // a bottle timer isn't paused by nursing
  assert.equal(computeDue(timer({ kind: 'nap', intervalMin: 90 }), [log('sleep', 0.5, { running: true })], NOW).state, 'active');
});

test('nap counts from waking up; medicine can follow one named medicine', () => {
  const logs = [log('sleep', 3, { end: NOW - 1 * H }), log('med', 20, { name: 'Vitamin D' }), log('med', 2, { name: 'Gas drops' })];
  assert.equal(computeDue(timer({ kind: 'nap', intervalMin: 90 }), logs, NOW).due, NOW + 0.5 * H);
  assert.equal(computeDue(timer({ kind: 'med', intervalMin: 1440, label: 'vitamin d' }), logs, NOW).due, NOW + 4 * H);
  assert.equal(lastAnchor('med', '', logs), NOW - 2 * H);
});

test('one-time timers, disabled timers and deleted logs', () => {
  assert.equal(computeDue(timer({ kind: 'once', dueAt: NOW + 30 * 60e3 }), [], NOW).state, 'waiting');
  assert.equal(computeDue(timer({ kind: 'once', dueAt: NOW - 1 }), [], NOW).state, 'due');
  assert.equal(computeDue(timer({ kind: 'feed', intervalMin: 180, enabled: false }), [], NOW).state, 'off');
  const r = computeDue(timer({ kind: 'diaper', intervalMin: 60 }, NOW - 0.5 * H), [{ ...log('diaper', 0.1), deleted: true }], NOW);
  assert.equal(r.fromLog, false);
});

test('reminder wording', () => {
  const info = computeDue(timer({ kind: 'breast', intervalMin: 180 }), [log('breast', 3.5, { lastSide: 'L' })], NOW);
  const m = reminderText(timer({ kind: 'breast' }), 'Nora', info, { lastSide: 'L', now: NOW });
  assert.equal(m.title, '🤱 Time to breastfeed Nora');
  assert.match(m.body, /3h 30m ago\. Start on the right side\./);
  const f = reminderText(timer({ kind: 'diaper' }), 'Nora', { ...info, due: NOW - 31 * 60e3 }, { followUp: true, now: NOW });
  assert.equal(f.title, 'Reminder: Diaper check for Nora');
  assert.equal(fmtSpan(90 * 60e3), '1h 30m');
});

test('snooze delays only the current alert', () => {
  const logs = [log('diaper', 4)];
  const base = computeDue(timer({ kind: 'diaper', intervalMin: 180 }), logs, NOW);
  const snoozed = computeDue(timer({ kind: 'diaper', intervalMin: 180, snoozeFor: base.due, snoozeUntil: NOW + 15 * 60e3 }), logs, NOW);
  assert.equal(snoozed.state, 'waiting'); assert.equal(snoozed.due, NOW + 15 * 60e3);
  // a new diaper change → fresh 3h countdown, snooze no longer applies
  const fresh = computeDue(timer({ kind: 'diaper', intervalMin: 180, snoozeFor: base.due, snoozeUntil: NOW + 15 * 60e3 }), [...logs, log('diaper', 0)], NOW);
  assert.equal(fresh.due, NOW + 3 * H);
});

test('durations read naturally', async () => {
  const { fmtInterval } = await import('../public/js/timer-core.js');
  assert.equal(fmtInterval(24 * 60), '24h');
  assert.equal(fmtInterval(150), '2h 30m');
  assert.equal(fmtSpan(3 * 864e5), '3d');
});
