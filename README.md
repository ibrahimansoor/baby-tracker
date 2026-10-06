# 🍅 My Little Pomodoro

A modern, Italian-inspired newborn tracker. Log every feed, bottle and diaper in two taps — designed for one-handed use at 3am.

## Features

- **Breastfeed** — live Left/Right timer that survives closing the app, switches sides, and suggests which breast to start on next. Manual entry too.
- **Formula / bottle** — amount in ml or oz with quick presets (30/60/90/120/150 ml), formula vs. expressed breast milk.
- **Pee & poop** — wet, dirty or both, with optional poop colour & texture. Warns gently on colours that need a pediatrician (red, white/pale, black after day 4).
- **Today dashboard** — time since last feed and diaper, today's feeds / wet / dirty vs. age-based newborn guidelines, total ml and nursing minutes.
- **History** — full history grouped by day, 7-day chart, filters, tap any entry to edit or delete (with undo).
- **Guide** — diapers-by-day, poop colour chart, feeding rhythm & hunger cues, formula amounts by age (highlighted for your baby's age), safe sleep, when to call the doctor, and care for parents.
- **Dark mode** — true-black theme for night feeds (auto, or toggle).
- **Private & offline** — data stays on the device (localStorage). Installable to the home screen as an app. CSV export for the pediatrician, JSON backup/restore.

## Run it

It's a static site — open `index.html`, or serve the folder:

```bash
python3 -m http.server 8000
```

The included GitHub Pages workflow deploys it on every push to `main`.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | App shell, icons, tab bar, bottom sheet |
| `style.css` | Modern design system with Italian accents (tomato, Aperol, Campari pink, Amalfi lemon, Riviera blue) + dark mode |
| `script.js` | All app logic: storage, timer, logging, dashboard, history, guide |
| `sw.js`, `manifest.webmanifest`, `icon.svg` | Offline + install-to-home-screen support |

> The guide is general information, not medical advice. Always follow your pediatrician.
