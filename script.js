/* ==========================================================
   My Little Pomodoro — newborn tracker
   Everything is stored on this device (localStorage).
   ========================================================== */
(function () {
  'use strict';

  const STORE_KEY = 'pomodoro.v1';
  const MIN = 60 * 1000;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;

  // ---------- State ----------
  const defaults = () => ({
    baby: null,                 // { name, birth: 'YYYY-MM-DD' }
    entries: [],                // see TYPES below
    timer: null,                // { startedAt, side: 'L'|'R'|null, sideStart, acc: {L, R} }
    settings: { theme: 'auto', unit: 'ml' }
  });

  let state = load();
  let tab = 'today';
  let diaryFilter = 'all';

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return defaults();
      const s = Object.assign(defaults(), JSON.parse(raw));
      s.settings = Object.assign(defaults().settings, s.settings);
      return s;
    } catch (e) {
      return defaults();
    }
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
    catch (e) { toast('Could not save — storage is full or blocked'); }
  }

  // ---------- Entry types ----------
  // breast: { left: sec, right: sec, lastSide }
  // bottle: { ml, milk: 'formula'|'breastmilk' }
  // diaper: { pee: bool, poop: bool, color?, texture? }
  const TYPES = {
    breast: { it: 'Allattamento', en: 'Breastfeed', icon: 'i-breast', cls: 't-breast' },
    bottle: { it: 'Biberon', en: 'Formula / bottle', icon: 'i-bottle', cls: 't-bottle' },
    pee:    { it: 'Pipì', en: 'Wet diaper', icon: 'i-drop', cls: 't-pee' },
    poop:   { it: 'Cacca', en: 'Dirty diaper', icon: 'i-poop', cls: 't-poop' }
  };

  const POOP_COLORS = [
    { id: 'black',  name: 'Black',   hex: '#2B2522', warnAfterDay: 4 },
    { id: 'green',  name: 'Green',   hex: '#6E7D35' },
    { id: 'yellow', name: 'Mustard', hex: '#D9A82A' },
    { id: 'tan',    name: 'Tan',     hex: '#B98B4E' },
    { id: 'brown',  name: 'Brown',   hex: '#7A4E2D' },
    { id: 'red',    name: 'Red',     hex: '#B3322A', warn: true },
    { id: 'white',  name: 'Pale',    hex: '#E8E2D2', warn: true }
  ];
  const TEXTURES = ['Seedy', 'Soft', 'Runny', 'Pasty', 'Hard'];

  // ---------- Helpers ----------
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const icon = (id) => `<svg><use href="#${id}"/></svg>`;
  const pad = (n) => String(n).padStart(2, '0');

  const startOfDay = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const fmtTime = (t) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const toLocalInput = (t) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const fromLocalInput = (v) => { const t = new Date(v).getTime(); return isNaN(t) ? Date.now() : t; };

  function fmtAgo(t, now = Date.now()) {
    const diff = Math.max(0, now - t);
    if (diff < MIN) return 'just now';
    const h = Math.floor(diff / HOUR), m = Math.floor((diff % HOUR) / MIN);
    if (h >= 48) return `${Math.floor(h / 24)}d ago`;
    return h ? `${h}h ${m}m` : `${m}m`;
  }
  function fmtClock(sec) {
    sec = Math.max(0, Math.floor(sec));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
  }
  const mins = (sec) => Math.round(sec / 60);
  const ozOf = (ml) => (ml / 29.5735).toFixed(1);
  function vol(ml) {
    return state.settings.unit === 'oz' ? `${ozOf(ml)} oz` : `${Math.round(ml)} ml`;
  }

  function dayLabel(t) {
    const today = startOfDay(Date.now());
    const d = startOfDay(t);
    if (d === today) return { it: 'Oggi', en: 'Today' };
    if (d === today - DAY) return { it: 'Ieri', en: 'Yesterday' };
    const date = new Date(t);
    return {
      it: date.toLocaleDateString('it-IT', { weekday: 'long' }).replace(/^./, (c) => c.toUpperCase()),
      en: date.toLocaleDateString([], { month: 'short', day: 'numeric' })
    };
  }

  // Baby's age in whole days (birth day = day 0)
  function ageDays() {
    if (!state.baby || !state.baby.birth) return null;
    const [y, m, d] = state.baby.birth.split('-').map(Number);
    const b = new Date(y, m - 1, d).getTime();
    return Math.max(0, Math.round((startOfDay(Date.now()) - b) / DAY));
  }
  function ageText() {
    const d = ageDays();
    if (d == null) return '';
    if (d === 0) return 'Born today — benvenuto al mondo';
    if (d < 14) return `${d} day${d === 1 ? '' : 's'} old · Giorno ${d + 1}`;
    if (d < 7 * 13) {
      const w = Math.floor(d / 7), r = d % 7;
      return `${w} weeks${r ? `, ${r} day${r === 1 ? '' : 's'}` : ''} old`;
    }
    const months = Math.floor(d / 30.44);
    return `${months} months old`;
  }

  // Daily guide targets (AAP / lactation consensus, first weeks)
  function targets() {
    const d = ageDays();
    const dayOfLife = d == null ? 6 : d + 1;
    const wet = dayOfLife >= 5 ? 6 : Math.max(1, dayOfLife);
    let dirty = dayOfLife >= 4 ? 3 : Math.max(1, dayOfLife);
    if (d != null && d > 42) dirty = 1; // after ~6 weeks frequency varies widely
    const feeds = d != null && d > 60 ? 6 : 8;
    return { wet, dirty, feeds, dayOfLife };
  }

  const sorted = () => state.entries.slice().sort((a, b) => b.t - a.t);
  const isFeed = (e) => e.type === 'breast' || e.type === 'bottle';
  const hasPee = (e) => e.type === 'diaper' && e.pee;
  const hasPoop = (e) => e.type === 'diaper' && e.poop;
  const last = (pred) => sorted().find(pred);

  function lastBreastSide() {
    const e = last((x) => x.type === 'breast');
    return e ? e.lastSide : null;
  }
  const otherSide = (s) => (s === 'L' ? 'R' : 'L');
  const sideName = (s) => (s === 'L' ? 'Left' : 'Right');

  function summarize(list) {
    const s = { feeds: 0, breastSec: 0, bottleMl: 0, formulaMl: 0, wet: 0, dirty: 0, bottles: 0, nursing: 0 };
    list.forEach((e) => {
      if (e.type === 'breast') { s.feeds++; s.nursing++; s.breastSec += (e.left || 0) + (e.right || 0); }
      if (e.type === 'bottle') { s.feeds++; s.bottles++; s.bottleMl += e.ml || 0; if (e.milk !== 'breastmilk') s.formulaMl += e.ml || 0; }
      if (hasPee(e)) s.wet++;
      if (hasPoop(e)) s.dirty++;
    });
    return s;
  }
  const entriesOn = (dayStart) => state.entries.filter((e) => e.t >= dayStart && e.t < dayStart + DAY);

  function entryView(e) {
    if (e.type === 'breast') {
      const parts = [];
      if (e.left) parts.push(`L ${mins(e.left)}m`);
      if (e.right) parts.push(`R ${mins(e.right)}m`);
      return { k: 'breast', title: 'Breastfeed', detail: `${parts.join(' · ') || 'Nursing'} · ${mins((e.left || 0) + (e.right || 0))} min total` };
    }
    if (e.type === 'bottle') {
      return { k: 'bottle', title: e.milk === 'breastmilk' ? 'Bottle · breast milk' : 'Formula', detail: vol(e.ml || 0) + (state.settings.unit === 'ml' ? ` · ${ozOf(e.ml || 0)} oz` : '') };
    }
    // diaper
    const k = e.poop ? 'poop' : 'pee';
    const title = e.pee && e.poop ? 'Pee + poop' : e.poop ? 'Poop' : 'Pee';
    const bits = [];
    if (e.poop && e.color) {
      const c = POOP_COLORS.find((x) => x.id === e.color);
      if (c) bits.push(`<span class="swatch-dot" style="background:${c.hex}"></span>${c.name}`);
    }
    if (e.poop && e.texture) bits.push(esc(e.texture));
    if (!bits.length) bits.push(e.pee && e.poop ? 'Wet & dirty diaper' : e.poop ? 'Dirty diaper' : 'Wet diaper');
    return { k, title, detail: bits.join(' · '), html: true };
  }

  function entryRow(e) {
    const v = entryView(e);
    const T = TYPES[v.k];
    const note = e.note ? ` · ${esc(e.note)}` : '';
    return `<button class="entry ${T.cls}" data-edit="${e.id}">
      <span class="ico">${icon(T.icon)}</span>
      <span class="main">
        <span class="title">${v.title}</span>
        <span class="detail" style="display:block">${v.html ? v.detail : esc(v.detail)}${note}</span>
      </span>
      <span class="time">${fmtTime(e.t)}</span>
    </button>`;
  }

  // ---------- Rendering ----------
  const view = $('#view');

  function render() {
    applyTheme();
    $('#tabbar').hidden = !state.baby;
    $('#brandSub').textContent = state.baby ? `Diario di ${state.baby.name}` : 'Diario del bambino';
    if (!state.baby) { view.innerHTML = renderWelcome(); bindWelcome(); return; }
    $$('#tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    if (tab === 'today') view.innerHTML = renderToday();
    if (tab === 'diary') view.innerHTML = renderDiary();
    if (tab === 'guide') view.innerHTML = renderGuide();
    if (tab === 'settings') { view.innerHTML = renderSettings(); bindSettings(); }
    tick();
  }

  function greeting() {
    const h = new Date().getHours();
    if (h < 5) return 'Buonanotte';
    if (h < 12) return 'Buongiorno';
    if (h < 18) return 'Buon pomeriggio';
    if (h < 22) return 'Buonasera';
    return 'Buonanotte';
  }

  function renderWelcome() {
    return `<section class="welcome">
      <svg class="big-tomato"><use href="#i-tomato"/></svg>
      <div class="eyebrow">Benvenuti</div>
      <h1>My Little <em>Pomodoro</em></h1>
      <p class="tag">A calm, beautiful diary for every feed, bottle and diaper — made for the 3am moments.</p>
      <form class="card" id="welcomeForm">
        <div class="field">
          <label for="wName">Baby's name</label>
          <input class="input" id="wName" required placeholder="e.g. Nora" autocomplete="off">
        </div>
        <div class="field">
          <label for="wBirth">Birthday</label>
          <input class="input" id="wBirth" type="date" required max="${toLocalInput(Date.now()).slice(0, 10)}">
        </div>
        <button class="btn btn-primary btn-block" type="submit">Cominciamo · Let's begin</button>
        <p class="small muted" style="text-align:center;margin:12px 0 0">Your data stays private on this device.</p>
      </form>
    </section>`;
  }
  function bindWelcome() {
    $('#welcomeForm').addEventListener('submit', (ev) => {
      ev.preventDefault();
      const name = $('#wName').value.trim();
      const birth = $('#wBirth').value;
      if (!name || !birth) return;
      state.baby = { name, birth };
      save(); tab = 'today'; render();
    });
  }

  function renderLiveTimer() {
    const tm = state.timer;
    if (!tm) return '';
    return `<div class="card live" id="liveCard">
      <div class="live-head">
        <div class="eyebrow" style="color:var(--rosa)"><span class="live-dot"></span>${tm.side ? 'Nursing now' : 'Paused'}</div>
        <button class="chip" data-act="discard-timer">Discard</button>
      </div>
      <div class="live-total" data-timer-total>0:00</div>
      ${sideButtons()}
      <button class="btn btn-primary btn-block" style="margin-top:12px" data-act="stop-timer">Finish & save</button>
    </div>`;
  }
  function sideButtons() {
    const tm = state.timer;
    const suggest = otherSide(lastBreastSide() || 'R');
    const btn = (s) => {
      const on = tm && tm.side === s;
      return `<button class="side-btn ${on ? 'on' : ''} ${!tm && s === suggest ? 'suggest' : ''}" data-side="${s}">
        <div class="s-name">${icon(on ? 'i-pause' : 'i-play')} ${sideName(s)}</div>
        <div class="s-time" data-side-time="${s}">${fmtClock(tm ? tm.acc[s] : 0)}</div>
        <div class="s-hint">${on ? 'tap to pause' : !tm && s === suggest ? 'suggested next' : tm ? 'tap to switch' : 'tap to start'}</div>
      </button>`;
    };
    return `<div class="sides">${btn('L')}${btn('R')}</div>`;
  }

  function ring(value, goal, color) {
    const r = 27, c = 2 * Math.PI * r;
    const pct = Math.min(1, goal ? value / goal : 0);
    return `<div class="ring"><svg viewBox="0 0 64 64">
      <circle class="bg" cx="32" cy="32" r="${r}" fill="none" stroke-width="6"/>
      <circle class="fg" cx="32" cy="32" r="${r}" fill="none" stroke-width="6" stroke="${color}" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct)}"/>
    </svg><div class="num">${value}</div></div>`;
  }

  function renderToday() {
    const now = Date.now();
    const lastFeed = last(isFeed);
    const lastDiaper = last((e) => e.type === 'diaper');
    const lastPee = last(hasPee), lastPoop = last(hasPoop);
    const lastBreast = last((e) => e.type === 'breast'), lastBottle = last((e) => e.type === 'bottle');
    const todayList = entriesOn(startOfDay(now)).sort((a, b) => b.t - a.t);
    const s = summarize(todayList);
    const tg = targets();
    const nextSide = lastBreastSide() ? otherSide(lastBreastSide()) : null;

    const feedSub = lastFeed ? (lastFeed.type === 'bottle' ? `${vol(lastFeed.ml || 0)} ${lastFeed.milk === 'breastmilk' ? 'breast milk' : 'formula'} at ${fmtTime(lastFeed.t)}` : `Nursed at ${fmtTime(lastFeed.t)}`) : 'Nothing logged yet';
    const diaperSub = lastDiaper ? `${entryView(lastDiaper).title} at ${fmtTime(lastDiaper.t)}` : 'Nothing logged yet';

    return `
      <section class="card hero">
        <svg class="hero-deco"><use href="#i-tomato"/></svg>
        <div class="eyebrow">${greeting()}</div>
        <h1><em>${esc(state.baby.name)}</em></h1>
        <div class="age">${ageText()}</div>
        <div class="since-grid">
          <div class="since">
            <div class="lbl">Last feed</div>
            <div class="val" ${lastFeed ? `data-since="${lastFeed.t}"` : ''}>${lastFeed ? fmtAgo(lastFeed.t) : '—'}</div>
            <div class="sub">${feedSub}</div>
          </div>
          <div class="since">
            <div class="lbl">Last diaper</div>
            <div class="val" ${lastDiaper ? `data-since="${lastDiaper.t}"` : ''}>${lastDiaper ? fmtAgo(lastDiaper.t) : '—'}</div>
            <div class="sub">${diaperSub}</div>
          </div>
        </div>
        ${nextSide && !state.timer ? `<div class="next-side">Next breast: <span class="pill">${icon('i-breast')} ${sideName(nextSide)}</span></div>` : ''}
      </section>

      ${renderLiveTimer()}

      <div class="section-title"><h2>Quick <em>log</em></h2></div>
      <div class="actions">
        ${actionBtn('breast', state.timer ? 'running' : lastBreast && fmtAgo(lastBreast.t))}
        ${actionBtn('bottle', lastBottle && fmtAgo(lastBottle.t))}
        ${actionBtn('pee', lastPee && fmtAgo(lastPee.t))}
        ${actionBtn('poop', lastPoop && fmtAgo(lastPoop.t))}
      </div>

      <div class="section-title"><h2>Oggi <em>·</em> today</h2></div>
      <div class="stats">
        <div class="card stat">${ring(s.feeds, tg.feeds, 'var(--rosa)')}<div class="k">Feeds</div><div class="g">goal ${tg.feeds}–12</div></div>
        <div class="card stat">${ring(s.wet, tg.wet, 'var(--limone)')}<div class="k">Wet</div><div class="g">expect ${tg.wet}+</div></div>
        <div class="card stat">${ring(s.dirty, tg.dirty, 'var(--terracotta)')}<div class="k">Dirty</div><div class="g">expect ${tg.dirty}+</div></div>
      </div>
      <div class="mini-stats">
        <div class="card mini t-bottle"><span class="ico">${icon('i-bottle')}</span><div><div class="v">${state.settings.unit === 'oz' ? ozOf(s.bottleMl) : s.bottleMl}<small> ${state.settings.unit}</small></div><div class="l">${s.bottles} bottle${s.bottles === 1 ? '' : 's'}${s.formulaMl && s.formulaMl !== s.bottleMl ? ` · ${vol(s.formulaMl)} formula` : ''}</div></div></div>
        <div class="card mini t-breast"><span class="ico">${icon('i-breast')}</span><div><div class="v">${mins(s.breastSec)}<small> min</small></div><div class="l">${s.nursing} nursing session${s.nursing === 1 ? '' : 's'}</div></div></div>
      </div>

      <div class="section-title"><h2>La <em>giornata</em></h2>${todayList.length ? '<button class="link" data-goto="diary">See diary →</button>' : ''}</div>
      ${todayList.length ? `<div class="timeline">${todayList.map(entryRow).join('')}</div>` : `
        <div class="empty">
          <svg><use href="#i-tomato"/></svg>
          <p class="it">Una pagina bianca</p>
          <p class="small">Tap a quick log above to record the first moment of the day.</p>
        </div>`}
      <p class="disclaimer" style="text-align:center">Goals are general newborn guidelines (day ${tg.dayOfLife} of life) — your pediatrician knows your baby best.</p>
    `;
  }
  function actionBtn(type, lastTxt) {
    const T = TYPES[type];
    return `<button class="action ${T.cls}" data-log="${type}">
      ${lastTxt ? `<span class="last" ${lastTxt !== 'running' ? '' : 'style="color:var(--rosa)"'}>${lastTxt === 'running' ? '● live' : lastTxt}</span>` : ''}
      <span class="ico">${icon(T.icon)}</span>
      <span><div class="it">${T.it}</div><div class="en">${T.en}</div></span>
    </button>`;
  }

  function renderWeek() {
    const today = startOfDay(Date.now());
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = today - i * DAY;
      days.push({ d, s: summarize(entriesOn(d)) });
    }
    const max = Math.max(8, ...days.map((x) => x.s.feeds + x.s.wet + x.s.dirty));
    const h = (n) => `${(n / max) * 100}%`;
    return `<div class="card week">
      <div class="week-head"><h3>La settimana</h3>
        <div class="legend"><span><i style="background:var(--rosa)"></i>Feeds</span><span><i style="background:var(--limone)"></i>Wet</span><span><i style="background:var(--terracotta)"></i>Dirty</span></div>
      </div>
      <div class="bars">
        ${days.map(({ d, s }) => `<div class="bar-col">
          <div class="n">${s.feeds || ''}</div>
          <div class="bar-stack">
            <div style="height:${h(s.feeds)};background:var(--rosa)"></div>
            <div style="height:${h(s.wet)};background:var(--limone)"></div>
            <div style="height:${h(s.dirty)};background:var(--terracotta)"></div>
          </div>
          <div class="d ${d === today ? 'today' : ''}">${new Date(d).toLocaleDateString([], { weekday: 'narrow' })}</div>
        </div>`).join('')}
      </div>
    </div>`;
  }

  function renderDiary() {
    const filters = [['all', 'Tutto · All'], ['feeds', 'Feeds'], ['diapers', 'Diapers'], ['poop', 'Poop only']];
    const pred = {
      all: () => true,
      feeds: isFeed,
      diapers: (e) => e.type === 'diaper',
      poop: hasPoop
    }[diaryFilter];
    const list = sorted().filter(pred);
    const groups = [];
    list.forEach((e) => {
      const d = startOfDay(e.t);
      let g = groups[groups.length - 1];
      if (!g || g.d !== d) { g = { d, items: [] }; groups.push(g); }
      g.items.push(e);
    });
    return `
      <div class="section-title" style="margin-top:4px"><h2>Il <em>diario</em></h2></div>
      ${renderWeek()}
      <div class="chips" style="margin-top:18px">
        ${filters.map(([k, l]) => `<button class="chip ${diaryFilter === k ? 'on' : ''}" data-filter="${k}">${l}</button>`).join('')}
      </div>
      ${groups.length ? groups.map((g) => {
        const lbl = dayLabel(g.d);
        const s = summarize(entriesOn(g.d));
        return `<div class="day-head"><h3>${lbl.it} <em>${lbl.en}</em></h3>
          <div class="sum">${s.feeds} feeds · ${vol(s.bottleMl)} · ${mins(s.breastSec)}m nursing<br>${s.wet} wet · ${s.dirty} dirty</div></div>
          <div class="timeline">${g.items.map(entryRow).join('')}</div>`;
      }).join('') : `<div class="empty" style="margin-top:18px"><svg><use href="#i-tomato"/></svg><p class="it">Niente ancora</p><p class="small">Entries you log will appear here, grouped by day.</p></div>`}
    `;
  }

  function renderGuide() {
    const d = ageDays();
    const dol = d == null ? null : d + 1;
    const diaperRows = [
      [1, 'Day 1', '1+', '1+ black, tarry (meconium)'],
      [2, 'Day 2', '2+', '2+ black / dark green'],
      [3, 'Day 3', '3+', '3+ green-brown (transitional)'],
      [4, 'Day 4', '4+', '3+ turning yellow'],
      [5, 'Day 5–6 wks', '6+', '3–4+ mustard yellow, seedy*']
    ];
    const rowNow = (n) => dol != null && (n === 5 ? dol >= 5 && dol <= 42 : dol === n);
    const formulaRows = [
      ['Days 1–3', '15–30 ml', '½–1 oz', 'every 2–3 h'],
      ['Days 4–7', '30–60 ml', '1–2 oz', 'every 2–3 h'],
      ['Weeks 2–4', '60–90 ml', '2–3 oz', 'every 3 h'],
      ['1–2 months', '90–120 ml', '3–4 oz', 'every 3–4 h'],
      ['2–4 months', '120–180 ml', '4–6 oz', 'every 3–4 h']
    ];
    const fNow = (i) => d != null && [d <= 2, d >= 3 && d <= 6, d >= 7 && d <= 29, d >= 30 && d <= 60, d > 60 && d <= 120][i];
    return `
      <section class="guide-intro">
        <div class="eyebrow">La guida</div>
        <h1>What's <em>normal</em>, day by day</h1>
        <p>Gentle, evidence-based reference for the first months. Highlighted rows match ${esc(state.baby.name)}'s age today.</p>
      </section>

      <div class="card gcard t-pee">
        <h3><span class="ico">${icon('i-drop')}</span>Diapers by day</h3>
        <p class="lead">Wet and dirty diapers are the best everyday sign your baby is getting enough milk.</p>
        <table class="gtable">
          <thead><tr><th>Age</th><th>Wet</th><th>Dirty</th></tr></thead>
          <tbody>${diaperRows.map(([n, a, w, p]) => `<tr class="${rowNow(n) ? 'now' : ''}"><td>${a}</td><td>${w}</td><td>${p}</td></tr>`).join('')}</tbody>
        </table>
        <ul>
          <li>Urine should be pale yellow. Dark urine or orange "brick dust" crystals after day 3–4 can mean baby needs more milk.</li>
          <li>*Formula-fed babies often poop less (tan to yellow-brown, pasty). After ~6 weeks, breastfed babies may go days between poops — that can be normal if they're soft and baby is gaining.</li>
        </ul>
      </div>

      <div class="card gcard t-poop">
        <h3><span class="ico">${icon('i-poop')}</span>Poop colour guide</h3>
        <p class="lead">Most shades are normal. A few deserve a call to your pediatrician.</p>
        <div class="poop-colors">
          <div class="pc"><span class="sw" style="background:#2B2522"></span><div><b>Black, sticky</b>Meconium — normal days 1–3.</div></div>
          <div class="pc"><span class="sw" style="background:#6E7D35"></span><div><b>Green</b>Transitional stools, or occasional — usually fine.</div></div>
          <div class="pc"><span class="sw" style="background:#D9A82A"></span><div><b>Mustard yellow</b>Classic breastfed poop, seedy and loose.</div></div>
          <div class="pc"><span class="sw" style="background:#B98B4E"></span><div><b>Tan / brown</b>Typical for formula, thicker like peanut butter.</div></div>
          <div class="pc warn"><span class="sw" style="background:#B3322A"></span><div><b>Red</b>Blood — call your pediatrician.</div></div>
          <div class="pc warn"><span class="sw" style="background:#E8E2D2"></span><div><b>White / chalky / grey</b>Call promptly — can signal a liver issue.</div></div>
        </div>
        <p class="small muted" style="margin:10px 0 0">Black poop returning after day 4 also needs a call.</p>
      </div>

      <div class="card gcard t-breast">
        <h3><span class="ico">${icon('i-breast')}</span>Feeding rhythm</h3>
        <ul>
          <li>Newborns feed <b>8–12 times in 24 hours</b> — roughly every 2–3 hours, including at night.</li>
          <li><b>Early hunger cues:</b> stirring, rooting, hands to mouth, lip smacking. Crying is a late cue — try to feed before it.</li>
          <li><b>Full cues:</b> relaxed hands, turning away, falling asleep, releasing the breast or bottle.</li>
          <li>Offer both breasts; start the next feed on the side you finished — the app suggests it for you.</li>
          <li><b>Cluster feeding</b> (many feeds close together, often evenings) is normal, especially in growth spurts around 2–3 weeks, 6 weeks and 3 months.</li>
          <li>In the first weeks, wake baby to feed if 4 hours have passed, until your pediatrician says otherwise.</li>
        </ul>
      </div>

      <div class="card gcard t-bottle">
        <h3><span class="ico">${icon('i-bottle')}</span>Formula amounts</h3>
        <p class="lead">Typical per-feed volumes. Let baby lead — appetite varies feed to feed.</p>
        <table class="gtable">
          <thead><tr><th>Age</th><th>Per feed</th><th>How often</th></tr></thead>
          <tbody>${formulaRows.map((r, i) => `<tr class="${fNow(i) ? 'now' : ''}"><td>${r[0]}</td><td style="white-space:nowrap">${r[1]}<div class="muted small">${r[2]}</div></td><td>${r[3]}</td></tr>`).join('')}</tbody>
        </table>
        <ul>
          <li>Rule of thumb: about <b>150 ml per kg</b> (2½ oz per lb) of body weight per day, and no more than ~960 ml (32 oz) a day.</li>
          <li>Mix exactly as the label says — never water it down or add extra powder.</li>
          <li>Toss any leftover within 1 hour of starting a feed. Prepared, untouched bottles keep up to 24 h in the fridge.</li>
          <li>Try <b>paced bottle feeding</b>: hold the bottle more horizontal and pause often so baby controls the flow.</li>
        </ul>
      </div>

      <div class="card gcard">
        <h3><span class="ico" style="--s:var(--basilico-soft);--c:var(--basilico)">${icon('i-moon')}</span>Safe sleep — the ABCs</h3>
        <ul>
          <li><b>Alone</b> — no pillows, blankets, bumpers or toys.</li>
          <li><b>Back</b> — always on their back, for every sleep.</li>
          <li><b>Crib</b> — a firm, flat surface. Room-share (not bed-share) for at least the first 6 months.</li>
          <li>Keep the room comfortably cool; dress baby in one more layer than you'd wear.</li>
        </ul>
      </div>

      <div class="callout">
        <h3>Call your pediatrician if…</h3>
        <ul>
          <li>Rectal temperature of <b>100.4°F (38°C) or higher</b> in a baby under 3 months — call right away.</li>
          <li>Fewer wet diapers than expected, dark urine, dry mouth or a sunken soft spot.</li>
          <li>Baby is very hard to wake, too sleepy to feed, or refusing feeds.</li>
          <li>Yellow skin or eyes that spread or deepen, especially to the belly or legs.</li>
          <li>Repeated forceful vomiting, green vomit, or trouble breathing (call 911 for blue lips or struggling to breathe).</li>
          <li>White, red or (after day 4) black poop.</li>
        </ul>
      </div>

      <div class="card gcard">
        <h3><span class="ico" style="--s:var(--pomodoro-soft);--c:var(--pomodoro)">${icon('i-breast')}</span>E anche tu — care for you</h3>
        <ul>
          <li>Sleep when you can, eat and drink water at every feed, and say yes to help.</li>
          <li>Baby blues are common for ~2 weeks. Sadness, anxiety or scary thoughts lasting longer deserve support — you're not alone.</li>
          <li>US National Maternal Mental Health Hotline, 24/7: call or text <b>1-833-852-6262</b> (1-833-TLC-MAMA).</li>
        </ul>
      </div>

      <p class="sources">Sources: <a href="https://www.healthychildren.org/English/ages-stages/baby/formula-feeding/Pages/amount-and-schedule-of-formula-feedings.aspx" target="_blank" rel="noopener">AAP / HealthyChildren.org</a> ·
        <a href="https://www.seattlechildrens.org/conditions/a-z/bottle-feeding-formula-questions/" target="_blank" rel="noopener">Seattle Children's</a> ·
        <a href="https://healthy.kaiserpermanente.org/health-wellness/health-encyclopedia/he.baby's-daily-needs-what-to-expect.te6304" target="_blank" rel="noopener">Kaiser Permanente</a> ·
        <a href="https://www.pampers.com/en-us/baby/diapering/article/how-many-wet-diapers-should-a-newborn-have" target="_blank" rel="noopener">Pampers (AAP-based)</a></p>
      <p class="disclaimer">This guide is for general information and doesn't replace medical advice. When in doubt, call your pediatrician — that's what they're there for.</p>
    `;
  }

  function renderSettings() {
    const st = state.settings;
    const seg = (key, opts) => `<div class="seg" data-setting="${key}">${opts.map(([v, l]) => `<button type="button" data-v="${v}" class="${st[key] === v ? 'on' : ''}">${l}</button>`).join('')}</div>`;
    return `
      <div class="section-title" style="margin-top:4px"><h2>Le <em>impostazioni</em></h2></div>
      <form class="card" id="babyForm">
        <div class="eyebrow" style="margin-bottom:12px">Il bambino</div>
        <div class="row">
          <div class="field"><label for="sName">Name</label><input class="input" id="sName" value="${esc(state.baby.name)}" required></div>
          <div class="field"><label for="sBirth">Birthday</label><input class="input" id="sBirth" type="date" value="${esc(state.baby.birth)}" required></div>
        </div>
        <button class="btn btn-ghost btn-block" type="submit">Save profile</button>
      </form>

      <div class="card set-list" style="margin-top:14px;padding:0">
        <div class="set-row"><div><div class="t">Appearance</div><div class="d">Notte mode is easy on tired eyes</div></div>${seg('theme', [['auto', 'Auto'], ['light', 'Giorno'], ['dark', 'Notte']])}</div>
        <div class="set-row"><div><div class="t">Volume unit</div><div class="d">For bottles &amp; formula</div></div>${seg('unit', [['ml', 'ml'], ['oz', 'oz']])}</div>
      </div>

      <div class="card set-list" style="margin-top:14px;padding:0">
        <div class="set-row"><div><div class="t">Export for the pediatrician</div><div class="d">Spreadsheet (CSV) of every entry</div></div><button class="chip" data-act="export-csv">CSV</button></div>
        <div class="set-row"><div><div class="t">Back up</div><div class="d">Save a copy you can restore later</div></div><button class="chip" data-act="export-json">Download</button></div>
        <div class="set-row"><div><div class="t">Restore</div><div class="d">Load a backup file</div></div><label class="chip" style="cursor:pointer">Choose file<input type="file" id="importFile" accept="application/json,.json" hidden></label></div>
        <div class="set-row"><div><div class="t" style="color:var(--pomodoro)">Erase everything</div><div class="d">${state.entries.length} entries on this device</div></div><button class="chip" data-act="reset">Erase</button></div>
      </div>

      <p class="small muted" style="margin:14px 4px 0">Tip: on iPhone tap Share → <b>Add to Home Screen</b> (Android: menu → Install app) to use My Little Pomodoro like a native app, even offline.</p>
      <p class="footer-note">Fatto con amore · made with love, one feed at a time.</p>
    `;
  }
  function bindSettings() {
    $('#babyForm').addEventListener('submit', (ev) => {
      ev.preventDefault();
      const name = $('#sName').value.trim();
      const birth = $('#sBirth').value;
      if (!name || !birth) return;
      state.baby = { name, birth };
      save(); render(); toast('Profile saved');
    });
    $$('[data-setting]').forEach((seg) => seg.addEventListener('click', (ev) => {
      const b = ev.target.closest('button'); if (!b) return;
      state.settings[seg.dataset.setting] = b.dataset.v;
      save(); render();
    }));
    $('#importFile').addEventListener('change', (ev) => {
      const f = ev.target.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        try {
          const data = JSON.parse(r.result);
          if (!data || !Array.isArray(data.entries)) throw new Error('bad');
          if (!confirm(`Replace current data with this backup (${data.entries.length} entries)?`)) return;
          state = Object.assign(defaults(), data);
          state.settings = Object.assign(defaults().settings, data.settings);
          save(); render(); toast('Backup restored');
        } catch (e) { toast('That file is not a Pomodoro backup'); }
      };
      r.readAsText(f);
    });
  }

  function download(name, text, type) {
    const blob = new Blob([text], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function exportCSV() {
    const q = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    const rows = [['Date', 'Time', 'Type', 'Left (min)', 'Right (min)', 'Amount (ml)', 'Milk', 'Pee', 'Poop', 'Colour', 'Texture', 'Note']];
    sorted().reverse().forEach((e) => {
      const d = new Date(e.t);
      rows.push([
        d.toLocaleDateString(), fmtTime(e.t),
        e.type === 'diaper' ? 'Diaper' : e.type === 'breast' ? 'Breastfeed' : 'Bottle',
        e.type === 'breast' ? mins(e.left || 0) : '', e.type === 'breast' ? mins(e.right || 0) : '',
        e.type === 'bottle' ? e.ml : '', e.type === 'bottle' ? (e.milk === 'breastmilk' ? 'Breast milk' : 'Formula') : '',
        e.type === 'diaper' ? (e.pee ? 'Yes' : 'No') : '', e.type === 'diaper' ? (e.poop ? 'Yes' : 'No') : '',
        e.color || '', e.texture || '', e.note || ''
      ]);
    });
    download(`${state.baby.name}-pomodoro-log.csv`, rows.map((r) => r.map(q).join(',')).join('\n'), 'text/csv');
  }

  // ---------- Live ticking ----------
  function timerTotals() {
    const tm = state.timer;
    if (!tm) return null;
    const live = tm.side ? (Date.now() - tm.sideStart) / 1000 : 0;
    const L = tm.acc.L + (tm.side === 'L' ? live : 0);
    const R = tm.acc.R + (tm.side === 'R' ? live : 0);
    return { L, R, total: L + R };
  }
  function tick() {
    const now = Date.now();
    $$('[data-since]').forEach((el) => { el.textContent = fmtAgo(+el.dataset.since, now); });
    const tt = timerTotals();
    if (tt) {
      $$('[data-timer-total]').forEach((el) => { el.textContent = fmtClock(tt.total); });
      $$('[data-side-time]').forEach((el) => { el.textContent = fmtClock(tt[el.dataset.sideTime]); });
    }
  }
  setInterval(tick, 1000);
  // Re-render on the minute so day boundaries & greetings stay fresh
  setInterval(() => { if (!sheetOpen() && state.baby && tab !== 'settings') render(); }, 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { state = load(); if (!sheetOpen()) render(); else tick(); } });

  // ---------- Timer actions ----------
  function tapSide(side) {
    const now = Date.now();
    if (!state.timer) {
      state.timer = { startedAt: now, side, sideStart: now, acc: { L: 0, R: 0 } };
    } else {
      const tm = state.timer;
      if (tm.side) tm.acc[tm.side] += (now - tm.sideStart) / 1000;
      if (tm.side === side) { tm.side = null; tm.lastSide = side; }
      else { tm.side = side; tm.sideStart = now; }
    }
    save();
  }
  function stopTimer() {
    const tt = timerTotals();
    const tm = state.timer;
    if (!tm) return;
    const lastSide = tm.side || tm.lastSide || (tt.R > tt.L ? 'R' : 'L');
    state.timer = null;
    if (tt.total < 5) { save(); toast('Timer discarded — too short'); return; }
    addEntry({ type: 'breast', t: tm.startedAt, left: Math.round(tt.L), right: Math.round(tt.R), lastSide });
    toast(`Saved ${mins(tt.total) || '<1'} min nursing · next: ${sideName(otherSide(lastSide))}`);
  }

  function addEntry(e) {
    e.id = e.id || uid();
    state.entries.push(e);
    save();
  }

  // ---------- Sheet (log / edit) ----------
  const sheet = $('#sheet'), scrim = $('#scrim'), body = $('#sheetBody');
  const sheetOpen = () => !sheet.hidden;
  let sheetCtx = null;

  function openSheet(eyebrow, title, html, ctx) {
    sheetCtx = ctx || null;
    $('#sheetEyebrow').textContent = eyebrow;
    $('#sheetTitle').textContent = title;
    body.innerHTML = html;
    sheet.hidden = false; scrim.hidden = false;
    document.body.style.overflow = 'hidden';
    tick();
  }
  function closeSheet() {
    sheet.hidden = true; scrim.hidden = true; sheetCtx = null;
    document.body.style.overflow = '';
    render();
  }

  function timeField(t) {
    return `<div class="field">
      <label for="fTime">When</label>
      <input class="input" type="datetime-local" id="fTime" value="${toLocalInput(t)}">
      <div class="time-chips">
        <button type="button" class="chip" data-ago="0">Now</button>
        <button type="button" class="chip" data-ago="5">5m ago</button>
        <button type="button" class="chip" data-ago="15">15m ago</button>
        <button type="button" class="chip" data-ago="30">30m ago</button>
        <button type="button" class="chip" data-ago="60">1h ago</button>
      </div>
    </div>`;
  }
  const noteField = (v) => `<div class="field"><label for="fNote">Note <span class="muted" style="font-weight:500">(optional)</span></label><textarea class="input" id="fNote" rows="2" placeholder="Spit up a little, very sleepy…">${esc(v || '')}</textarea></div>`;
  const actionsRow = (editing) => `<div class="btn-row">${editing ? '<button type="button" class="btn btn-danger" data-act="delete">Delete</button>' : ''}<button type="submit" class="btn btn-primary">${editing ? 'Save changes' : 'Save'}</button></div>`;

  function stepper(id, value, unit, cls = '') {
    return `<div class="stepper ${cls}">
      <button type="button" data-step="${id}" data-d="-1" aria-label="Less">−</button>
      <div class="val"><input type="number" inputmode="numeric" id="${id}" value="${value}" min="0"><div class="unit">${unit}</div></div>
      <button type="button" data-step="${id}" data-d="1" aria-label="More">+</button>
    </div>`;
  }

  function openLog(type, existing) {
    const editing = !!existing;
    if (type === 'pee' || type === 'poop' || type === 'diaper') return openDiaper(existing || { pee: type === 'pee', poop: type === 'poop' }, editing);
    if (type === 'bottle') return openBottle(existing, editing);
    if (type === 'breast') return openBreast(existing, editing);
  }

  function openDiaper(e, editing) {
    const html = `<form id="logForm">
      <div class="field"><div class="label">What's in the diaper?</div>
        <div class="toggles">
          <button type="button" class="toggle t-pee ${e.pee ? 'on' : ''}" data-toggle="pee"><span class="ico">${icon('i-drop')}</span>Pipì<span class="chk">✓</span></button>
          <button type="button" class="toggle t-poop ${e.poop ? 'on' : ''}" data-toggle="poop"><span class="ico">${icon('i-poop')}</span>Cacca<span class="chk">✓</span></button>
        </div>
      </div>
      <div id="poopDetails" ${e.poop ? '' : 'hidden'}>
        <div class="field"><div class="label">Colour <span class="muted" style="font-weight:500">(optional)</span></div>
          <div class="swatches">${POOP_COLORS.map((c) => `<button type="button" class="swatch ${e.color === c.id ? 'on' : ''}" data-color="${c.id}"><span class="c" style="background:${c.hex}"></span>${c.name}</button>`).join('')}</div>
          <div id="colorWarn"></div>
        </div>
        <div class="field"><div class="label">Texture <span class="muted" style="font-weight:500">(optional)</span></div>
          <div class="chips">${TEXTURES.map((x) => `<button type="button" class="chip ${e.texture === x ? 'on' : ''}" data-texture="${x}">${x}</button>`).join('')}</div>
        </div>
      </div>
      ${timeField(e.t || Date.now())}
      ${noteField(e.note)}
      ${actionsRow(editing)}
    </form>`;
    const title = e.poop && !e.pee ? 'Cacca' : e.pee && !e.poop ? 'Pipì' : 'Pannolino';
    openSheet(editing ? 'Edit diaper' : 'New diaper', title, html, { kind: 'diaper', entry: editing ? e : null, pee: !!e.pee, poop: !!e.poop, color: e.color || null, texture: e.texture || null });
    updateColorWarn();
  }
  function updateColorWarn() {
    const box = $('#colorWarn'); if (!box || !sheetCtx) return;
    const c = POOP_COLORS.find((x) => x.id === sheetCtx.color);
    const d = ageDays();
    let msg = '';
    if (c && c.warn) msg = c.id === 'red' ? 'Red can mean blood — please call your pediatrician.' : 'White, chalky or grey poop needs a prompt call to your pediatrician.';
    else if (c && c.warnAfterDay && d != null && d >= c.warnAfterDay) msg = 'Black poop after the first few days should be checked with your pediatrician.';
    box.innerHTML = msg ? `<div class="warn-note">${msg}</div>` : '';
  }

  function openBottle(e, editing) {
    e = e || {};
    const lastB = last((x) => x.type === 'bottle');
    const ml = e.ml != null ? e.ml : lastB ? lastB.ml : 60;
    const milk = e.milk || (lastB && lastB.milk) || 'formula';
    const oz = state.settings.unit === 'oz';
    const shown = oz ? +ozOf(ml) : ml;
    const presets = oz ? [1, 2, 3, 4, 5] : [30, 60, 90, 120, 150];
    const html = `<form id="logForm">
      <div class="field"><div class="seg" data-milk>
        <button type="button" data-v="formula" class="${milk === 'formula' ? 'on' : ''}">Formula</button>
        <button type="button" data-v="breastmilk" class="${milk === 'breastmilk' ? 'on' : ''}">Breast milk</button>
      </div></div>
      <div class="field"><div class="label">How much?</div>
        ${stepper('fMl', shown, oz ? 'ounces' : 'millilitres')}
        <div class="chips" style="justify-content:center;margin-top:12px">${presets.map((p) => `<button type="button" class="chip" data-preset="${p}">${p} ${oz ? 'oz' : 'ml'}</button>`).join('')}</div>
      </div>
      ${timeField(e.t || Date.now())}
      ${noteField(e.note)}
      ${actionsRow(editing)}
    </form>`;
    openSheet(editing ? 'Edit bottle' : 'New bottle', 'Biberon', html, { kind: 'bottle', entry: editing ? e : null, milk, step: oz ? 0.5 : 10 });
  }

  function openBreast(e, editing) {
    if (!editing) {
      // Live timer first, manual entry below
      const suggest = otherSide(lastBreastSide() || 'R');
      const tm = state.timer;
      const html = `
        <div class="card live" style="margin-top:0">
          <div class="live-head"><div class="eyebrow" style="color:var(--rosa)">${tm ? `<span class="live-dot"></span>${tm.side ? 'Nursing now' : 'Paused'}` : 'Timer'}</div>
          ${tm ? '<button class="chip" data-act="discard-timer">Discard</button>' : `<span class="small muted">Suggested: ${sideName(suggest)}</span>`}</div>
          <div class="live-total" data-timer-total>${fmtClock(0)}</div>
          ${sideButtons()}
          ${tm ? '<button class="btn btn-primary btn-block" style="margin-top:12px" data-act="stop-timer">Finish & save</button>' : ''}
        </div>
        <div class="or">or log it manually</div>
        ${manualBreastForm({}, false)}`;
      openSheet('Nursing', 'Allattamento', html, { kind: 'breast', entry: null });
      return;
    }
    openSheet('Edit nursing', 'Allattamento', manualBreastForm(e, true), { kind: 'breast', entry: e });
  }
  function manualBreastForm(e, editing) {
    return `<form id="logForm">
      <div class="row">
        <div class="field"><div class="label" style="text-align:center">Left · min</div>${stepper('fLeft', e.left != null ? mins(e.left) : 0, 'minutes', 'sm')}</div>
        <div class="field"><div class="label" style="text-align:center">Right · min</div>${stepper('fRight', e.right != null ? mins(e.right) : 0, 'minutes', 'sm')}</div>
      </div>
      <div class="field"><div class="label">Finished on</div><div class="seg" data-lastside>
        <button type="button" data-v="L" class="${e.lastSide === 'L' ? 'on' : ''}">Left</button>
        <button type="button" data-v="R" class="${e.lastSide !== 'L' ? 'on' : ''}">Right</button>
      </div></div>
      ${timeField(e.t || Date.now())}
      ${noteField(e.note)}
      ${actionsRow(editing)}
    </form>`;
  }

  function submitForm() {
    const ctx = sheetCtx; if (!ctx) return;
    const t = fromLocalInput($('#fTime').value);
    const note = $('#fNote').value.trim();
    let data;
    if (ctx.kind === 'diaper') {
      if (!ctx.pee && !ctx.poop) { toast('Choose pipì, cacca or both'); return; }
      data = { type: 'diaper', t, pee: ctx.pee, poop: ctx.poop, color: ctx.poop ? ctx.color : null, texture: ctx.poop ? ctx.texture : null, note };
    } else if (ctx.kind === 'bottle') {
      let v = parseFloat($('#fMl').value) || 0;
      if (state.settings.unit === 'oz') v = v * 29.5735;
      v = Math.round(v);
      if (v <= 0) { toast('Enter an amount'); return; }
      data = { type: 'bottle', t, ml: v, milk: ctx.milk, note };
    } else if (ctx.kind === 'breast') {
      const L = (parseFloat($('#fLeft').value) || 0) * 60, R = (parseFloat($('#fRight').value) || 0) * 60;
      if (L + R <= 0) { toast('Add minutes for at least one side'); return; }
      const lsBtn = $('[data-lastside] .on');
      data = { type: 'breast', t, left: L, right: R, lastSide: lsBtn ? lsBtn.dataset.v : (R ? 'R' : 'L'), note };
    }
    if (ctx.entry) {
      Object.assign(ctx.entry, data);
      // keep the stored object (it's referenced from state.entries)
      const i = state.entries.findIndex((x) => x.id === ctx.entry.id);
      if (i >= 0) state.entries[i] = ctx.entry;
      save(); closeSheet(); toast('Updated');
    } else {
      addEntry(data);
      const saved = data.id;
      closeSheet();
      toast(`${entryView(data).title} logged at ${fmtTime(t)}`, () => {
        state.entries = state.entries.filter((x) => x.id !== saved); save(); render();
      });
    }
  }

  // ---------- Global events ----------
  document.addEventListener('click', (ev) => {
    const el = ev.target.closest('button, [data-act]');
    if (!el) return;

    if (el.dataset.tab) { tab = el.dataset.tab; render(); window.scrollTo({ top: 0 }); return; }
    if (el.dataset.goto) { tab = el.dataset.goto; render(); window.scrollTo({ top: 0 }); return; }
    if (el.dataset.log) { openLog(el.dataset.log); return; }
    if (el.dataset.filter) { diaryFilter = el.dataset.filter; render(); return; }
    if (el.dataset.edit) {
      const e = state.entries.find((x) => x.id === el.dataset.edit);
      if (e) openLog(e.type === 'diaper' ? 'diaper' : e.type, e);
      return;
    }
    if (el.dataset.side) {
      tapSide(el.dataset.side);
      if (sheetOpen()) { openBreast(null, false); } else { render(); }
      return;
    }

    const act = el.dataset.act;
    if (act === 'stop-timer') { stopTimer(); if (sheetOpen()) closeSheet(); else render(); return; }
    if (act === 'discard-timer') {
      if (confirm('Discard this nursing session?')) { state.timer = null; save(); if (sheetOpen()) openBreast(null, false); else render(); }
      return;
    }
    if (act === 'delete' && sheetCtx && sheetCtx.entry) {
      const e = sheetCtx.entry;
      state.entries = state.entries.filter((x) => x.id !== e.id);
      save(); closeSheet();
      toast('Entry deleted', () => { state.entries.push(e); save(); render(); });
      return;
    }
    if (act === 'export-csv') { exportCSV(); return; }
    if (act === 'export-json') { download(`${state.baby.name}-pomodoro-backup-${toLocalInput(Date.now()).slice(0, 10)}.json`, JSON.stringify(state, null, 2), 'application/json'); return; }
    if (act === 'reset') {
      if (confirm('Erase all data on this device? This cannot be undone.') && confirm('Are you sure? Consider downloading a backup first.')) {
        state = defaults(); save(); tab = 'today'; render();
      }
      return;
    }

    // Sheet-scoped controls
    if (!sheetOpen() || !sheet.contains(el)) return;
    if (el.dataset.ago != null) {
      $('#fTime').value = toLocalInput(Date.now() - (+el.dataset.ago) * MIN);
      $$('[data-ago]').forEach((b) => b.classList.toggle('on', b === el));
      return;
    }
    if (el.dataset.toggle) {
      const k = el.dataset.toggle;
      sheetCtx[k] = !sheetCtx[k];
      el.classList.toggle('on', sheetCtx[k]);
      $('#poopDetails').hidden = !sheetCtx.poop;
      $('#sheetTitle').textContent = sheetCtx.poop && !sheetCtx.pee ? 'Cacca' : sheetCtx.pee && !sheetCtx.poop ? 'Pipì' : 'Pannolino';
      return;
    }
    if (el.dataset.color) {
      sheetCtx.color = sheetCtx.color === el.dataset.color ? null : el.dataset.color;
      $$('[data-color]').forEach((b) => b.classList.toggle('on', b.dataset.color === sheetCtx.color));
      updateColorWarn();
      return;
    }
    if (el.dataset.texture) {
      sheetCtx.texture = sheetCtx.texture === el.dataset.texture ? null : el.dataset.texture;
      $$('[data-texture]').forEach((b) => b.classList.toggle('on', b.dataset.texture === sheetCtx.texture));
      return;
    }
    if (el.dataset.preset) { $('#fMl').value = el.dataset.preset; return; }
    if (el.dataset.step) {
      const inp = $('#' + el.dataset.step);
      const step = el.dataset.step === 'fMl' ? sheetCtx.step : 1;
      const v = Math.max(0, (parseFloat(inp.value) || 0) + step * +el.dataset.d);
      inp.value = Math.round(v * 10) / 10;
      return;
    }
    const segParent = el.parentElement;
    if (segParent && segParent.hasAttribute('data-milk')) {
      sheetCtx.milk = el.dataset.v;
      $$('button', segParent).forEach((b) => b.classList.toggle('on', b === el));
      return;
    }
    if (segParent && segParent.hasAttribute('data-lastside')) {
      $$('button', segParent).forEach((b) => b.classList.toggle('on', b === el));
    }
  });

  document.addEventListener('submit', (ev) => {
    if (ev.target.id === 'logForm') { ev.preventDefault(); submitForm(); }
  });
  $('#sheetClose').addEventListener('click', closeSheet);
  scrim.addEventListener('click', closeSheet);
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && sheetOpen()) closeSheet(); });

  // ---------- Toast ----------
  let toastTimer;
  function toast(msg, undo) {
    const el = $('#toast');
    el.innerHTML = `<span>${esc(msg)}</span>${undo ? '<button type="button">Undo</button>' : ''}`;
    if (undo) $('button', el).onclick = () => { undo(); el.classList.remove('show'); };
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), undo ? 5000 : 2600);
  }

  // ---------- Theme ----------
  function applyTheme() {
    const t = state.settings.theme;
    if (t === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
  }
  $('#themeBtn').addEventListener('click', () => {
    const dark = document.documentElement.dataset.theme === 'dark' ||
      (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
    state.settings.theme = dark ? 'light' : 'dark';
    save(); render();
  });

  // ---------- Boot ----------
  render();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
