// Parent guide — evidence-based reference, highlighted for the baby's age.
import { esc, icon, ageDays } from '../util.js';
import { baby } from '../store.js';

export function renderGuide() {
  const b = baby();
  const d = ageDays(b.birth);
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
    <button class="back-link" data-act="tab" data-tab="more">‹ More</button>
    <section class="guide-intro">
      <div class="eyebrow">Parent guide</div>
      <h1>What's normal, day by day</h1>
      <p>Gentle, evidence-based reference for the first months. Highlighted rows match ${esc(b.name)}'s age today.</p>
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
      <h3><span class="ico" style="--s:var(--basil-soft);--c:var(--basil)">${icon('i-moon')}</span>Safe sleep — the ABCs</h3>
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
      <h3><span class="ico" style="--s:var(--tomato-soft);--c:var(--tomato)">${icon('i-breast')}</span>Care for you, too</h3>
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
