// Growth percentiles must match published WHO Child Growth Standards values.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as g from '../public/js/growth.js';
import { celebration, ymd } from '../public/js/util.js';

globalThis.fetch = async () => ({ json: async () => JSON.parse(fs.readFileSync(new URL('../public/data/who-growth.json', import.meta.url))) });
await g.loadWho();

test('WHO medians and percentiles', () => {
  assert.equal(g.lmsAt('weight', 'boy', 0)[1], 3.3464);
  assert.equal(g.valueAtZ(g.Z_FOR[3], g.lmsAt('weight', 'boy', 0)).toFixed(1), '2.5');
  assert.equal(g.lmsAt('weight', 'girl', 182.6)[1].toFixed(1), '7.3');
  assert.equal(g.lmsAt('length', 'boy', 365.25)[1].toFixed(1), '75.7');
  assert.equal(g.lmsAt('head', 'girl', 0)[1].toFixed(1), '33.9');
  assert.equal(Math.round(g.percentile('weight', 'boy', 0, 3.3464)), 50);
  assert.equal(g.fmtPct(2.9), '3rd');
  assert.equal(g.fmtPct(51.2), '51st');
  assert.equal(g.fmtPct(11.4), '11th');
});

test('client celebrations', () => {
  const at = (s) => new Date(s + 'T10:00:00');
  assert.equal(celebration({ name: 'N', birth: '2025-10-06' }, at('2026-10-06')).kind, 'birthday');
  assert.equal(celebration({ name: 'N', birth: '2025-10-07' }, at('2026-10-06')).kind, 'eve');
  assert.equal(celebration({ name: 'N', birth: '2026-07-06' }, at('2026-10-06')).kind, 'month');
  assert.equal(celebration({ name: 'N', birth: '2026-09-22' }, at('2026-10-06')).kind, 'week');
  assert.equal(celebration({ name: 'N', birth: '2026-09-23' }, at('2026-10-06')), null);
  assert.deepEqual(ymd('2026-01-31', at('2026-03-01')), { years: 0, months: 1, days: 1 });
});
