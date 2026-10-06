// WHO Child Growth Standards — percentiles via the LMS method.
// Data: public/data/who-growth.json (from github.com/WorldHealthOrganization/anthro), age in days.
let tables = null;

export async function loadWho() {
  if (tables) return tables;
  const res = await fetch('/data/who-growth.json');
  tables = (await res.json()).data;
  return tables;
}
export const whoReady = () => !!tables;

// metric: 'weight' (kg) | 'length' (cm) | 'head' (cm); sex: 'boy' | 'girl'
export function lmsAt(metric, sex, ageDays) {
  const rows = tables && tables[metric] && tables[metric][sex];
  if (!rows) return null;
  if (ageDays <= rows[0][0]) return rows[0].slice(1);
  if (ageDays >= rows[rows.length - 1][0]) return rows[rows.length - 1].slice(1);
  let lo = 0, hi = rows.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (rows[mid][0] <= ageDays) lo = mid; else hi = mid; }
  const a = rows[lo], b = rows[hi], f = (ageDays - a[0]) / (b[0] - a[0]);
  return [1, 2, 3].map((i) => a[i] + (b[i] - a[i]) * f);
}

export function zScore(x, [L, M, S]) {
  return Math.abs(L) < 1e-9 ? Math.log(x / M) / S : (Math.pow(x / M, L) - 1) / (L * S);
}
export function valueAtZ(z, [L, M, S]) {
  return Math.abs(L) < 1e-9 ? M * Math.exp(S * z) : M * Math.pow(1 + L * S * z, 1 / L);
}

// Standard normal CDF (Abramowitz–Stegun 7.1.26, error < 1.5e-7)
export function normCdf(z) {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z / 2);
  return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

export function percentile(metric, sex, ageDays, value) {
  const lms = lmsAt(metric, sex, ageDays);
  if (!lms || !value) return null;
  const p = normCdf(zScore(value, lms)) * 100;
  return Math.max(0.1, Math.min(99.9, p));
}

export const Z_FOR = { 3: -1.880794, 15: -1.036433, 50: 0, 85: 1.036433, 97: 1.880794 };

// Percentile curves for charting: { 3: [[day, value]…], 15: …, 50: …, 85: …, 97: … }
export function curves(metric, sex, maxDay, step = 7) {
  const out = {};
  for (const p of Object.keys(Z_FOR)) {
    out[p] = [];
    for (let d = 0; d <= maxDay; d += step) {
      const lms = lmsAt(metric, sex, d);
      if (lms) out[p].push([d, valueAtZ(Z_FOR[p], lms)]);
    }
  }
  return out;
}

export const fmtPct = (p) => {
  if (p == null) return '';
  const n = p < 1 ? '<1' : p > 99 ? '>99' : String(Math.round(p));
  const suf = /1$/.test(n) && n !== '11' ? 'st' : /2$/.test(n) && n !== '12' ? 'nd' : /3$/.test(n) && n !== '13' ? 'rd' : 'th';
  return n.startsWith('<') || n.startsWith('>') ? `${n}th` : `${n}${suf}`;
};
