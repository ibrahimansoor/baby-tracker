// Shared helpers
export const MIN = 60 * 1000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;

export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
export const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const icon = (id) => `<svg aria-hidden="true"><use href="#${id}"/></svg>`;
export const pad = (n) => String(n).padStart(2, '0');

export const uuid = () => (crypto.randomUUID ? crypto.randomUUID()
  : '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) => (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)));

export const startOfDay = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
export const fmtTime = (t) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
export const fmtDate = (t, opts = { month: 'short', day: 'numeric', year: 'numeric' }) => new Date(t).toLocaleDateString([], opts);
export const toLocalInput = (t) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export const toDateInput = (t) => toLocalInput(t).slice(0, 10);
export const fromLocalInput = (v) => { const t = new Date(v).getTime(); return isNaN(t) ? Date.now() : t; };
// 'YYYY-MM-DD' → local midnight timestamp
export const parseDay = (s) => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d).getTime(); };

export function fmtAgo(t, now = Date.now()) {
  const diff = Math.max(0, now - t);
  if (diff < MIN) return 'just now';
  const h = Math.floor(diff / HOUR), m = Math.floor((diff % HOUR) / MIN);
  if (h >= 48) return `${Math.floor(h / 24)}d ago`;
  return h ? `${h}h ${m}m` : `${m}m`;
}
export function fmtClock(sec) {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
export function fmtDur(ms) {
  const m = Math.round(ms / MIN);
  const h = Math.floor(m / 60);
  return h ? `${h}h ${m % 60}m` : `${m}m`;
}
export const mins = (sec) => Math.round(sec / 60);

export function dayLabel(t) {
  const today = startOfDay(Date.now());
  const d = startOfDay(t);
  if (d === today) return { a: 'Today', b: '' };
  if (d === today - DAY) return { a: 'Yesterday', b: '' };
  const date = new Date(t);
  return { a: date.toLocaleDateString([], { weekday: 'long' }), b: date.toLocaleDateString([], { month: 'short', day: 'numeric' }) };
}

// Age helpers. birth = 'YYYY-MM-DD'
export function ageDays(birth, now = Date.now()) {
  if (!birth) return null;
  return Math.max(0, Math.round((startOfDay(now) - parseDay(birth)) / DAY));
}
export function ageText(birth) {
  const d = ageDays(birth);
  if (d == null) return '';
  if (d === 0) return 'Born today — welcome to the world';
  if (d < 14) return `${d} day${d === 1 ? '' : 's'} old · Day ${d + 1} of life`;
  if (d < 7 * 13) {
    const w = Math.floor(d / 7), r = d % 7;
    return `${w} weeks${r ? `, ${r} day${r === 1 ? '' : 's'}` : ''} old`;
  }
  const { years, months } = ymd(birth);
  if (years < 2) return `${years * 12 + months} months old`;
  return `${years} years${months ? `, ${months} month${months === 1 ? '' : 's'}` : ''} old`;
}
// Completed years/months/days since birth. Month anniversaries clamp to short months
// (born Jan 31 → "1 month" on Feb 28), matching the server's reminder logic.
export function ymd(birth, now = new Date()) {
  const [by, bm, bd] = birth.split('-').map(Number);
  const anniversary = (k) => {
    const y = by + Math.floor((bm - 1 + k) / 12), m = (bm - 1 + k) % 12;
    return new Date(y, m, Math.min(bd, new Date(y, m + 1, 0).getDate())).getTime();
  };
  const today = startOfDay(now.getTime());
  let total = (now.getFullYear() - by) * 12 + (now.getMonth() + 1 - bm);
  while (total > 0 && anniversary(total) > today) total--;
  if (total < 0) total = 0;
  const days = Math.round((today - anniversary(total)) / DAY);
  return { years: Math.floor(total / 12), months: total % 12, days };
}

export const ordinal = (n) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };

// Today's celebration for a baby, if any (mirrors server/reminders.js)
export function celebration(baby, now = new Date()) {
  if (!baby || !baby.birth) return null;
  const age = ageDays(baby.birth, now.getTime());
  if (!age) return null;
  const { years, months, days } = ymd(baby.birth, now);
  if (months === 0 && days === 0 && years > 0) return { kind: 'birthday', title: `Happy ${ordinal(years)} birthday, ${baby.name}!`, emoji: '🎂' };
  const tomorrow = new Date(now.getTime() + DAY);
  const t = ymd(baby.birth, tomorrow);
  if (t.months === 0 && t.days === 0 && t.years > 0) return { kind: 'eve', title: `${baby.name}'s ${ordinal(t.years)} birthday is tomorrow`, emoji: '🎈' };
  const total = years * 12 + months;
  if (days === 0 && total >= 1 && total < 24) return { kind: 'month', title: `${baby.name} is ${total} month${total === 1 ? '' : 's'} old today!`, emoji: '🍅' };
  if (total < 1 && age % 7 === 0 && age / 7 <= 8) return { kind: 'week', title: `${baby.name} is ${age / 7} week${age === 7 ? '' : 's'} old today!`, emoji: '🍼' };
  return null;
}

export function initials(name) {
  return String(name || '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
}

export function debounce(fn, ms) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export function download(name, data, type) {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// Share a file through the phone's share sheet (→ Save to Files / iCloud Drive), else download.
export async function shareOrDownload(name, data, type) {
  const file = new File([data], name, { type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return 'shared'; }
    catch (e) { if (e.name === 'AbortError') return 'cancelled'; }
  }
  download(name, file, type);
  return 'downloaded';
}

// Resize an image File to a JPEG data URL (max edge in px)
export function resizeImage(file, max, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve({ dataUrl: c.toDataURL('image/jpeg', quality), w, h });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image')); };
    img.src = url;
  });
}

// iCalendar event (all-day yearly birthday, or timed appointment)
export function ics({ uid: id, title, start, allDay, yearly, description = '' }) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const d = new Date(start);
  const day = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const time = `${day}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
  const escIcs = (s) => String(s).replace(/[\\;,]/g, (c) => '\\' + c).replace(/\n/g, '\\n');
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//My Little Pomodoro//EN', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
    `UID:${id}@mylittlepomodoro`, `DTSTAMP:${stamp}`,
    allDay ? `DTSTART;VALUE=DATE:${day}` : `DTSTART:${time}`,
    allDay ? '' : `DURATION:PT1H`,
    yearly ? 'RRULE:FREQ=YEARLY' : '',
    `SUMMARY:${escIcs(title)}`, description ? `DESCRIPTION:${escIcs(description)}` : '',
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escIcs(title)}`, allDay ? 'TRIGGER:-PT15H' : 'TRIGGER:-PT1H', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR'
  ].filter(Boolean);
  return lines.join('\r\n');
}
