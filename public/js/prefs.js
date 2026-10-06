// Per-device preferences (theme & units). Data lives on the server; these stay on the phone.
const KEY = 'pomodoro.prefs';
const defaults = { theme: 'auto', skin: 'pomodoro', vol: 'ml', weight: 'kg', length: 'cm', temp: 'f' };

function load() {
  try {
    const p = JSON.parse(localStorage.getItem(KEY));
    if (p) return { ...defaults, ...p };
    // Carry over theme/units from the original single-phone version
    const old = JSON.parse(localStorage.getItem('pomodoro.v1'));
    if (old && old.settings) return { ...defaults, theme: old.settings.theme || 'auto', skin: old.settings.skin || 'pomodoro', vol: old.settings.unit || 'ml' };
  } catch { /* ignore */ }
  return { ...defaults };
}

export const prefs = load();
export function setPref(k, v) {
  prefs[k] = v;
  try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* private mode */ }
}

const r1 = (n) => Math.round(n * 10) / 10;
export const ML_PER_OZ = 29.5735;
export const KG_PER_LB = 0.45359237;

export const vol = (ml) => prefs.vol === 'oz' ? `${r1(ml / ML_PER_OZ)} oz` : `${Math.round(ml)} ml`;
export const volBoth = (ml) => prefs.vol === 'oz' ? `${r1(ml / ML_PER_OZ)} oz · ${Math.round(ml)} ml` : `${Math.round(ml)} ml · ${r1(ml / ML_PER_OZ)} oz`;
export function weight(kg) {
  if (prefs.weight === 'lb') {
    const totalOz = kg / KG_PER_LB * 16;
    let lb = Math.floor(totalOz / 16), oz = Math.round(totalOz - lb * 16);
    if (oz === 16) { lb++; oz = 0; }
    return `${lb} lb ${oz} oz`;
  }
  return `${kg.toFixed(kg < 10 ? 2 : 1)} kg`;
}
export const len = (cm) => prefs.length === 'in' ? `${r1(cm / 2.54)} in` : `${r1(cm)} cm`;
export const temp = (c) => prefs.temp === 'f' ? `${r1(c * 9 / 5 + 32)}°F` : `${r1(c)}°C`;
export const toC = (v) => prefs.temp === 'f' ? (v - 32) * 5 / 9 : v;
export const fromC = (c) => prefs.temp === 'f' ? r1(c * 9 / 5 + 32) : r1(c);
// Fever thresholds per AAP: ≥100.4°F (38°C)
export const isFever = (c) => c >= 38;
